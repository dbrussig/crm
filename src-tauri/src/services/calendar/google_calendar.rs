use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct EventDateTime {
    pub date: Option<String>,
    pub date_time: Option<String>,
    pub time_zone: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GoogleCalendarEvent {
    pub summary: String,
    pub description: Option<String>,
    pub start: EventDateTime,
    pub end: EventDateTime,
    pub location: Option<String>,
}
