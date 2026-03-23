import Foundation

enum FileStore {
    static func appSupportDirectory() throws -> URL {
        let url = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ).appendingPathComponent("MietparkCRM", isDirectory: true)

        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
}
