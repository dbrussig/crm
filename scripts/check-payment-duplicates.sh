#!/usr/bin/env bash
set -euo pipefail

DEFAULT_ICLOUD_DB="$HOME/Library/Mobile Documents/com~apple~CloudDocs/CRM Desktop/data/mietpark-crm.db"
DEFAULT_LEGACY_DB="$HOME/Library/Application Support/com.serverraum247.mietparkcrm.desktop/data/mietpark-crm.db"

if [[ $# -ge 1 && -n "${1:-}" ]]; then
  DB_PATH="$1"
elif [[ -f "$DEFAULT_ICLOUD_DB" ]]; then
  DB_PATH="$DEFAULT_ICLOUD_DB"
else
  DB_PATH="$DEFAULT_LEGACY_DB"
fi

if [[ ! -f "$DB_PATH" ]]; then
  echo "DB nicht gefunden: $DB_PATH" >&2
  exit 1
fi

sqlite3 -header -column "$DB_PATH" "
WITH p AS (
  SELECT
    id,
    rental_request_id,
    ifnull(invoice_id, '') AS invoice_id,
    ifnull(kind, '') AS kind,
    round(ifnull(amount, 0), 2) AS amount,
    date(received_at / 1000, 'unixepoch', 'localtime') AS day_key
  FROM payments
)
SELECT
  ifnull(json_extract(inv.raw_json, '$.invoiceNo'), '') AS invoice_no,
  a.rental_request_id,
  a.amount,
  a.day_key,
  a.id AS unlinked_id,
  a.kind AS unlinked_kind,
  b.id AS linked_id,
  b.kind AS linked_kind
FROM p a
JOIN p b
  ON a.rental_request_id = b.rental_request_id
 AND a.amount = b.amount
 AND a.day_key = b.day_key
 AND a.id < b.id
LEFT JOIN invoices inv
  ON inv.id = b.invoice_id
WHERE a.invoice_id = ''
  AND b.invoice_id <> ''
ORDER BY a.day_key DESC;
"
