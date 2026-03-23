pub const SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    raw_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    license_plate TEXT UNIQUE,
    category TEXT,
    daily_rate REAL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    raw_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rental_requests (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    resource_id TEXT,
    start_date INTEGER,
    end_date INTEGER,
    status TEXT NOT NULL,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    raw_json TEXT NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (resource_id) REFERENCES resources(id)
);

CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    rental_request_id TEXT,
    type TEXT NOT NULL,
    number TEXT NOT NULL,
    total_amount REAL NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    raw_json TEXT NOT NULL,
    FOREIGN KEY (rental_request_id) REFERENCES rental_requests(id)
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    rental_request_id TEXT,
    customer_id TEXT,
    gmail_thread_id TEXT,
    direction TEXT NOT NULL,
    subject TEXT,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    raw_json TEXT NOT NULL,
    FOREIGN KEY (rental_request_id) REFERENCES rental_requests(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    rental_request_id TEXT NOT NULL,
    customer_id TEXT,
    kind TEXT NOT NULL,
    method TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    received_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    raw_json TEXT NOT NULL,
    FOREIGN KEY (rental_request_id) REFERENCES rental_requests(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS invoice_items (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    raw_json TEXT NOT NULL,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);

CREATE TABLE IF NOT EXISTS customer_documents (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT,
    size_bytes INTEGER,
    created_at INTEGER NOT NULL,
    raw_json TEXT NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY,
    rental_request_id TEXT NOT NULL,
    google_event_id TEXT UNIQUE,
    title TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (rental_request_id) REFERENCES rental_requests(id)
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
    provider TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at INTEGER,
    scope TEXT,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS backup_history (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    location TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
"#;
