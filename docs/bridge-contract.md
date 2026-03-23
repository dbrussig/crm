# Bridge Contract

## JavaScript -> Swift

Alle Nachrichten laufen ueber `window.webkit.messageHandlers.mietparkCRM.postMessage(...)`.

Request:

```json
{
  "id": "uuid",
  "type": "storage:get",
  "payload": { "key": "mietpark_crm_customers_v1" }
}
```

## Swift -> JavaScript

Swift liefert Antworten per JavaScript-Callback:

```js
window.mietparkCRMBridgeResponse({
  id: "uuid",
  ok: true,
  result: { value: [] }
});
```

## Erste Nachrichtentypen

- `storage:get`
- `storage:set`
- `storage:remove`
- `file:save`
- `sync:status`
- `sync:run`

## Regeln

- Antworten muessen immer dieselbe `id` tragen
- `result` ist nur bei `ok: true` belegt
- Fehler werden als String in `error` geliefert
- Payloads bleiben JSON-kompatibel
