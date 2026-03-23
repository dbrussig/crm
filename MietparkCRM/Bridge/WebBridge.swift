import Foundation
import WebKit

final class WebBridge: NSObject, WKScriptMessageHandler {
    private weak var webView: WKWebView?
    private let localStore = LocalStore()

    func attach(webView: WKWebView) {
        self.webView = webView
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "mietparkCRM" else { return }
        guard let body = message.body as? [String: Any] else { return }
        handle(body: body)
    }

    private func handle(body: [String: Any]) {
        guard let id = body["id"] as? String, let type = body["type"] as? String else { return }
        let payload = body["payload"] as? [String: Any] ?? [:]

        switch type {
        case "storage:get":
            let key = payload["key"] as? String ?? ""
            let value = localStore.getValue(forKey: key)
            send(id: id, ok: true, result: ["value": value as Any], error: nil)
        case "storage:set":
            let key = payload["key"] as? String ?? ""
            let value = payload["value"]
            localStore.setValue(value, forKey: key)
            send(id: id, ok: true, result: ["saved": true], error: nil)
        case "storage:remove":
            let key = payload["key"] as? String ?? ""
            localStore.removeValue(forKey: key)
            send(id: id, ok: true, result: ["removed": true], error: nil)
        default:
            send(id: id, ok: false, result: nil, error: "Unsupported bridge message: \(type)")
        }
    }

    private func send(id: String, ok: Bool, result: [String: Any]?, error: String?) {
        guard let webView else { return }
        let response: [String: Any?] = [
            "id": id,
            "ok": ok,
            "result": result,
            "error": error
        ]

        guard
            let data = try? JSONSerialization.data(withJSONObject: response.compactMapValues { $0 }, options: []),
            let json = String(data: data, encoding: .utf8)
        else {
            return
        }

        let script = "window.mietparkCRMBridgeResponse(\(json));"
        DispatchQueue.main.async {
            webView.evaluateJavaScript(script, completionHandler: nil)
        }
    }
}
