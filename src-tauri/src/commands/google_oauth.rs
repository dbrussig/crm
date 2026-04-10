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
}

fn random_string(len: usize) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    let raw = format!("{:x}{:x}", seed, len * 1337);
    URL_SAFE_NO_PAD.encode(raw.as_bytes())[..len.min(43)].to_string()
}

fn pkce_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let digest = hasher.finalize();
    URL_SAFE_NO_PAD.encode(digest)
}

#[tauri::command]
pub async fn google_oauth_start(
    client_id: String,
    scopes: Vec<String>,
) -> Result<GoogleOAuthResult, String> {
    // 1. Freien Port finden und Listener VOR Browser-Öffnung binden
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("Port-Bind fehlgeschlagen: {}", e))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect_uri = format!("http://127.0.0.1:{}/callback", port);
    eprintln!("[OAuth] Listener auf Port {}", port);

    // 2. PKCE
    let verifier = random_string(43);
    let challenge = pkce_challenge(&verifier);
    let state = random_string(16);

    // 3. Auth-URL bauen (keine URL-Kodierung für den scope, space bleibt space via %20)
    let scope_str = scopes.join(" ");
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&state={}&code_challenge={}&code_challenge_method=S256&access_type=offline&prompt=consent",
        urlencoding::encode(&client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(&scope_str),
        urlencoding::encode(&state),
        urlencoding::encode(&challenge),
    );
    eprintln!("[OAuth] Auth-URL gebaut, öffne Browser...");

    // 4. System-Browser öffnen (macOS: open, Linux: xdg-open, Windows: start)
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&auth_url)
        .spawn()
        .map_err(|e| format!("Browser konnte nicht geöffnet werden: {}", e))?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&auth_url)
        .spawn()
        .map_err(|e| format!("Browser konnte nicht geöffnet werden: {}", e))?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &auth_url])
        .spawn()
        .map_err(|e| format!("Browser konnte nicht geöffnet werden: {}", e))?;

    eprintln!("[OAuth] Browser geöffnet, warte auf Callback...");

    // 5. Auf Callback warten mit Timeout (120 Sekunden)
    let code_result: Arc<Mutex<Option<Result<String, String>>>> = Arc::new(Mutex::new(None));
    let code_result_clone = Arc::clone(&code_result);
    let expected_state = state.clone();

    let handle = tokio::task::spawn_blocking(move || {
        // Timeout: Listener als non-blocking mit poll-Loop (max 120s)
        use std::time::Instant;
        let deadline = Instant::now() + Duration::from_secs(120);
        listener.set_nonblocking(true).ok();
        let stream_result = loop {
            match listener.accept() {
                Ok(s) => break Ok(s),
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    if Instant::now() >= deadline {
                        break Err(std::io::Error::new(std::io::ErrorKind::TimedOut, "Timeout"));
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }
                Err(e) => break Err(e),
            }
        };
        match stream_result {
            Ok((mut stream, _)) => {
                let mut reader = BufReader::new(&stream);
                let mut request_line = String::new();
                let _ = reader.read_line(&mut request_line);
                eprintln!("[OAuth] HTTP Request erhalten: {}", request_line.trim());

                let path = request_line
                    .split_whitespace()
                    .nth(1)
                    .unwrap_or("")
                    .to_string();
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

                let html_ok = "<html><body style='font-family:sans-serif;padding:2rem'>\
                    <h2>&#x2705; Anmeldung erfolgreich</h2>\
                    <p>Du kannst diesen Tab schliessen und zur App zurueckkehren.</p>\
                    </body></html>";
                let html_err = "<html><body style='font-family:sans-serif;padding:2rem'>\
                    <h2>&#x274C; Anmeldung fehlgeschlagen</h2>\
                    <p>Bitte versuche es erneut.</p>\
                    </body></html>";

                let result = if let Some(code) = params.get("code") {
                    let returned_state = params.get("state").map(|s| s.as_str()).unwrap_or("");
                    if returned_state != expected_state {
                        let _ = write!(stream, "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html\r\n\r\n{}", html_err);
                        Err("State mismatch".to_string())
                    } else {
                        let _ = write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n{}", html_ok);
                        Ok(code.clone())
                    }
                } else {
                    let error = params.get("error").cloned().unwrap_or_else(|| "Unbekannter Fehler".to_string());
                    let _ = write!(stream, "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html\r\n\r\n{}", html_err);
                    Err(format!("OAuth abgebrochen: {}", error))
                };

                let mut lock = code_result_clone.lock().unwrap();
                *lock = Some(result);
            }
            Err(e) => {
                eprintln!("[OAuth] Listener accept Fehler: {}", e);
                let mut lock = code_result_clone.lock().unwrap();
                *lock = Some(Err(format!("Timeout oder Fehler beim Warten auf Callback: {}", e)));
            }
        }
    });

    handle.await.map_err(|e| e.to_string())?;

    // 6. Code extrahieren
    let code = {
        let lock = code_result.lock().unwrap();
        match lock.as_ref() {
            Some(Ok(c)) => c.clone(),
            Some(Err(e)) => return Err(e.clone()),
            None => return Err("Kein OAuth-Code empfangen".to_string()),
        }
    };
    eprintln!("[OAuth] Code erhalten, tausche gegen Token...");

    // 7. Token-Tausch (PKCE – kein Client Secret nötig)
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

    Ok(GoogleOAuthResult {
        access_token: token.access_token,
        expires_in: token.expires_in,
        scope: token.scope,
        refresh_token: token.refresh_token,
    })
}
