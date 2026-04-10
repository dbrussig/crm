use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Serialize, Deserialize, Clone)]
pub struct OAuthTokenResponse {
    pub access_token: String,
    pub expires_in: u64,
    pub scope: String,
    pub token_type: String,
    pub refresh_token: Option<String>,
}

#[derive(Serialize)]
pub struct GoogleOAuthResult {
    pub access_token: String,
    pub expires_in: u64,
    pub scope: String,
    pub refresh_token: Option<String>,
    pub email: Option<String>,
    pub user_id: Option<String>,
}

/// Wird von google_oauth_prepare zurückgegeben – JS öffnet den Browser und ruft dann exchange auf.
#[derive(Serialize)]
pub struct OAuthPrepareResult {
    pub auth_url: String,
    pub port: u16,
    pub state: String,
    pub verifier: String,
    pub redirect_uri: String,
}

#[derive(Deserialize)]
struct UserInfoResponse {
    sub: Option<String>,
    email: Option<String>,
}

fn random_string(len: usize) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    let raw = format!("{:x}{:016x}", seed, len as u64 * 0xDEAD_BEEF);
    URL_SAFE_NO_PAD.encode(raw.as_bytes())[..len.min(43)].to_string()
}

fn pkce_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(hasher.finalize())
}

/// Schritt 1: Port binden, PKCE erzeugen, Auth-URL bauen.
/// JS öffnet danach den Browser selbst und ruft google_oauth_exchange auf.
#[tauri::command]
pub async fn google_oauth_prepare(
    client_id: String,
    scopes: Vec<String>,
) -> Result<OAuthPrepareResult, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Port-Bind fehlgeschlagen: {}", e))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect_uri = format!("http://127.0.0.1:{}/callback", port);
    eprintln!("[OAuth] prepare: Listener auf Port {}", port);

    let verifier = random_string(43);
    let challenge = pkce_challenge(&verifier);
    let state = random_string(16);
    let scope_str = scopes.join(" ");

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&state={}&code_challenge={}&code_challenge_method=S256&access_type=offline&prompt=consent",
        urlencoding::encode(&client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(&scope_str),
        urlencoding::encode(&state),
        urlencoding::encode(&challenge),
    );

    // Listener in globalem State parken, damit exchange ihn übernehmen kann
    get_listener_store().lock().unwrap().replace(listener);
    eprintln!("[OAuth] prepare: URL gebaut, warte auf JS-Browser-Öffnung");

    Ok(OAuthPrepareResult { auth_url, port, state, verifier, redirect_uri })
}

// Globaler Listener-Slot (nur ein OAuth-Flow gleichzeitig)
static PENDING_LISTENER: std::sync::OnceLock<Mutex<Option<TcpListener>>> = std::sync::OnceLock::new();

fn get_listener_store() -> &'static Mutex<Option<TcpListener>> {
    PENDING_LISTENER.get_or_init(|| Mutex::new(None))
}

/// Schritt 2: Auf Loopback-Callback warten, Code gegen Token tauschen.
#[tauri::command]
pub async fn google_oauth_exchange(
    client_id: String,
    redirect_uri: String,
    state: String,
    verifier: String,
) -> Result<GoogleOAuthResult, String> {
    eprintln!("[OAuth] exchange: Warte auf Callback...");

    let listener = get_listener_store()
        .lock()
        .unwrap()
        .take()
        .ok_or_else(|| "Kein aktiver OAuth-Listener. Bitte zuerst google_oauth_prepare aufrufen.".to_string())?;

    let code_result: Arc<Mutex<Option<Result<String, String>>>> = Arc::new(Mutex::new(None));
    let code_result_clone = Arc::clone(&code_result);
    let expected_state = state.clone();

    let handle = tokio::task::spawn_blocking(move || {
        use std::time::Instant;
        let deadline = Instant::now() + Duration::from_secs(120);
        listener.set_nonblocking(true).ok();

        let stream_result = loop {
            match listener.accept() {
                Ok(s) => break Ok(s),
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    if Instant::now() >= deadline {
                        break Err(std::io::Error::new(std::io::ErrorKind::TimedOut, "Timeout nach 120s"));
                    }
                    std::thread::sleep(Duration::from_millis(50));
                }
                Err(e) => break Err(e),
            }
        };

        match stream_result {
            Ok((mut stream, _)) => {
                let mut reader = BufReader::new(&stream);
                let mut request_line = String::new();
                let _ = reader.read_line(&mut request_line);
                eprintln!("[OAuth] exchange: HTTP Request: {}", request_line.trim());

                let path = request_line.split_whitespace().nth(1).unwrap_or("").to_string();
                let query = path.split('?').nth(1).unwrap_or("").to_string();
                let params: HashMap<String, String> = query
                    .split('&')
                    .filter_map(|p| {
                        let mut kv = p.splitn(2, '=');
                        Some((
                            urlencoding::decode(kv.next()?).ok()?.into_owned(),
                            urlencoding::decode(kv.next().unwrap_or("")).ok()?.into_owned(),
                        ))
                    })
                    .collect();

                let html_ok = b"HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n\
                    <html><body style='font-family:sans-serif;padding:2rem;background:#f0fdf4'>\
                    <h2 style='color:#16a34a'>&#x2705; Anmeldung erfolgreich</h2>\
                    <p>Du kannst diesen Tab schliessen und zur App zurueckkehren.</p>\
                    </body></html>";
                let html_err = b"HTTP/1.1 400 Bad Request\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n\
                    <html><body style='font-family:sans-serif;padding:2rem;background:#fef2f2'>\
                    <h2 style='color:#dc2626'>&#x274C; Anmeldung fehlgeschlagen</h2>\
                    <p>Bitte schliesse diesen Tab und versuche es erneut.</p>\
                    </body></html>";

                let result = if let Some(code) = params.get("code") {
                    let returned_state = params.get("state").map(|s| s.as_str()).unwrap_or("");
                    if returned_state != expected_state {
                        let _ = stream.write_all(html_err);
                        Err("State mismatch – möglicher CSRF-Angriff".to_string())
                    } else {
                        let _ = stream.write_all(html_ok);
                        Ok(code.clone())
                    }
                } else {
                    let error = params.get("error").cloned().unwrap_or_else(|| "Unbekannter Fehler".to_string());
                    let _ = stream.write_all(html_err);
                    Err(format!("OAuth abgebrochen: {}", error))
                };

                *code_result_clone.lock().unwrap() = Some(result);
            }
            Err(e) => {
                eprintln!("[OAuth] exchange: Listener-Fehler: {}", e);
                *code_result_clone.lock().unwrap() = Some(Err(format!("Timeout beim Warten auf Callback: {}", e)));
            }
        }
    });

    handle.await.map_err(|e| e.to_string())?;

    let code = {
        let lock = code_result.lock().unwrap();
        match lock.as_ref() {
            Some(Ok(c)) => c.clone(),
            Some(Err(e)) => return Err(e.clone()),
            None => return Err("Kein OAuth-Code empfangen".to_string()),
        }
    };
    eprintln!("[OAuth] exchange: Code erhalten, tausche gegen Token...");

    let client = Client::new();
    let token_resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code.as_str()),
            ("client_id", client_id.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("grant_type", "authorization_code"),
            ("code_verifier", verifier.as_str()),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = token_resp.status();
    let body = token_resp.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!("Token-Tausch fehlgeschlagen ({}): {}", status, body));
    }

    let token: OAuthTokenResponse =
        serde_json::from_str(&body).map_err(|e| format!("Token-Parse-Fehler: {}", e))?;

    eprintln!("[OAuth] exchange: Token erhalten. Lade UserInfo...");
    let (email, user_id) = fetch_userinfo(&client, &token.access_token).await;
    eprintln!("[OAuth] Verbunden als: {}", email.as_deref().unwrap_or("unbekannt"));

    Ok(GoogleOAuthResult {
        access_token: token.access_token,
        expires_in: token.expires_in,
        scope: token.scope,
        refresh_token: token.refresh_token,
        email,
        user_id,
    })
}

/// Öffnet eine URL im System-Browser – wird von JS aufgerufen
#[tauri::command]
pub async fn open_url_in_browser(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    eprintln!("[OAuth] open_url_in_browser: {}", &url[..url.len().min(80)]);
    app.opener()
        .open_url(&url, None::<String>)
        .map_err(|e| format!("Browser konnte nicht geöffnet werden: {}", e))
}

/// Legacy-Command – bleibt für Abwärtskompatibilität, delegiert intern
#[tauri::command]
pub async fn google_oauth_start(
    client_id: String,
    scopes: Vec<String>,
) -> Result<GoogleOAuthResult, String> {
    // Wird nicht mehr direkt genutzt – JS nutzt prepare + exchange
    Err("Bitte google_oauth_prepare + google_oauth_exchange verwenden.".to_string())
}

async fn fetch_userinfo(client: &Client, access_token: &str) -> (Option<String>, Option<String>) {
    let resp = client
        .get("https://www.googleapis.com/oauth2/v3/userinfo")
        .bearer_auth(access_token)
        .send()
        .await;
    match resp {
        Ok(r) if r.status().is_success() => {
            let info: Result<UserInfoResponse, _> = r.json().await;
            match info {
                Ok(u) => (u.email, u.sub),
                Err(_) => (None, None),
            }
        }
        _ => (None, None),
    }
}

#[tauri::command]
pub async fn google_token_refresh(
    client_id: String,
    refresh_token: String,
) -> Result<GoogleOAuthResult, String> {
    eprintln!("[OAuth] Starte Token-Refresh...");
    let client = Client::new();
    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", client_id.as_str()),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token.as_str()),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status();
    let body = resp.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        eprintln!("[OAuth] Refresh fehlgeschlagen ({})", status);
        return Err(format!("Token-Refresh fehlgeschlagen ({}): {}", status, body));
    }

    let token: OAuthTokenResponse =
        serde_json::from_str(&body).map_err(|e| format!("Refresh-Parse-Fehler: {}", e))?;

    let (email, user_id) = fetch_userinfo(&client, &token.access_token).await;
    eprintln!("[OAuth] Refresh erfolgreich.");

    Ok(GoogleOAuthResult {
        access_token: token.access_token,
        expires_in: token.expires_in,
        scope: token.scope,
        // Refresh-Token kommt beim Refresh nicht immer zurück – dann alten behalten
        refresh_token: if token.refresh_token.is_some() { token.refresh_token } else { Some(refresh_token) },
        email,
        user_id,
    })
}
