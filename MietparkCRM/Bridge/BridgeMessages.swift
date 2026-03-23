import Foundation

struct BridgeRequest: Decodable {
    let id: String
    let type: String
    let payload: [String: StringOrJSON]
}

enum StringOrJSON: Decodable {
    case string(String)
    case bool(Bool)
    case number(Double)
    case object([String: StringOrJSON])
    case array([StringOrJSON])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode([String: StringOrJSON].self) {
            self = .object(value)
        } else if let value = try? container.decode([StringOrJSON].self) {
            self = .array(value)
        } else {
            throw DecodingError.typeMismatch(
                StringOrJSON.self,
                DecodingError.Context(codingPath: decoder.codingPath, debugDescription: "Unsupported JSON payload")
            )
        }
    }
}

struct BridgeResponse<ResultType: Encodable>: Encodable {
    let id: String
    let ok: Bool
    let result: ResultType?
    let error: String?
}
