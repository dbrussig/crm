pub struct GoogleOAuthConfig {
    pub client_id: String,
    pub redirect_uri: String,
    pub calendar_scope: String,
    pub gmail_scope: String,
    pub drive_scope: String,
}

impl Default for GoogleOAuthConfig {
    fn default() -> Self {
        Self {
            client_id: "TODO_GOOGLE_CLIENT_ID".to_string(),
            redirect_uri: "mietpark-crm://oauth-callback".to_string(),
            calendar_scope: "https://www.googleapis.com/auth/calendar.events".to_string(),
            gmail_scope: "https://www.googleapis.com/auth/gmail.readonly".to_string(),
            drive_scope: "https://www.googleapis.com/auth/drive.file".to_string(),
        }
    }
}
