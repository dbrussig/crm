import Foundation

final class LocalStore {
    private let defaults = UserDefaults.standard

    func getValue(forKey key: String) -> Any? {
        defaults.object(forKey: namespacedKey(key))
    }

    func setValue(_ value: Any?, forKey key: String) {
        defaults.set(value, forKey: namespacedKey(key))
    }

    func removeValue(forKey key: String) {
        defaults.removeObject(forKey: namespacedKey(key))
    }

    private func namespacedKey(_ key: String) -> String {
        "mietpark.crm.mac.\(key)"
    }
}
