import Foundation

enum WebAssetLoader {
    static func appURL() -> URL? {
        Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "WebApp")
    }
}
