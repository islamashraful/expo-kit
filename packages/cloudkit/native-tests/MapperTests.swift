import CloudKit
import Foundation

func mapperTests() throws {
  let zone = CKRecordZone.ID(zoneName: "AppData", ownerName: CKCurrentUserDefaultName)
  let schema = SchemaModel(types: [
    "Venue": TypeModel(name: "Venue", fields: ["name": FieldModel(name: "name", kind: .string, optional: false, target: nil)]),
    "Shift": TypeModel(name: "Shift", fields: [
      "date": FieldModel(name: "date", kind: .date, optional: false, target: nil),
      "tips": FieldModel(name: "tips", kind: .double, optional: false, target: nil),
      "hours": FieldModel(name: "hours", kind: .int, optional: false, target: nil),
      "paid": FieldModel(name: "paid", kind: .bool, optional: false, target: nil),
      "note": FieldModel(name: "note", kind: .string, optional: true, target: nil),
      "tags": FieldModel(name: "tags", kind: .stringList, optional: false, target: nil),
      "scores": FieldModel(name: "scores", kind: .doubleList, optional: true, target: nil),
      "venue": FieldModel(name: "venue", kind: .reference, optional: false, target: "Venue"),
      "photo": FieldModel(name: "photo", kind: .asset, optional: true, target: nil),
    ]),
  ])
  let mapper = RecordMapper(schema: schema, zoneID: zone)

  // Record names
  check(RecordName.make(type: "Shift", id: "a.b") == "Shift.a.b", "record name joins type and id")
  check(RecordName.parse("Shift.a.b")! == ("Shift", "a.b"), "record name splits at the first dot")
  check(RecordName.parse("nodot") == nil, "record name without a dot is rejected")
  checkThrows("empty id", contains: "empty") { try RecordName.validate(type: "Shift", id: "") }
  checkThrows("non-ASCII id", contains: "ASCII") { try RecordName.validate(type: "Shift", id: "ü") }
  checkThrows("too long id", contains: "too long") { try RecordName.validate(type: "Shift", id: String(repeating: "a", count: 250)) }

  // Valid input, as JS sends it (numbers come in as Double, booleans as NSNumber booleans).
  let photo = FileManager.default.temporaryDirectory.appendingPathComponent("ek-photo.txt")
  try "hello".write(to: photo, atomically: true, encoding: .utf8)
  let input: [String: Any] = [
    "date": 1_700_000_000_000.0, "tips": 12.5, "hours": 3.0, "paid": true,
    "tags": ["a", "b"], "venue": "v1", "photo": photo.absoluteString,
  ]
  let normalized = try mapper.normalize(type: "Shift", id: "s1", fields: input)
  check(normalized["hours"] as? Int64 == 3, "int is stored as Int64")
  check(normalized["note"] is NSNull, "missing optional becomes NSNull")
  check(normalized["paid"] as? Bool == true, "bool stays bool")
  check(JSONSerialization.isValidJSONObject(normalized), "normalized fields are JSON-safe")

  // Errors
  checkThrows("unknown type", contains: "isn't a record type") { _ = try mapper.normalize(type: "Nope", id: "1", fields: [:]) }
  checkThrows("unknown field", contains: "Shift.typo isn't a field") {
    var bad = input; bad["typo"] = 1
    _ = try mapper.normalize(type: "Shift", id: "s1", fields: bad)
  }
  checkThrows("missing required", contains: "Shift.tips is required") {
    var bad = input; bad.removeValue(forKey: "tips")
    _ = try mapper.normalize(type: "Shift", id: "s1", fields: bad)
  }
  checkThrows("string for number", contains: "Shift.tips must be a number") {
    var bad = input; bad["tips"] = "12"
    _ = try mapper.normalize(type: "Shift", id: "s1", fields: bad)
  }
  checkThrows("fraction for int", contains: "Shift.hours must be a whole number") {
    var bad = input; bad["hours"] = 1.5
    _ = try mapper.normalize(type: "Shift", id: "s1", fields: bad)
  }
  checkThrows("number for bool", contains: "Shift.paid must be true or false") {
    var bad = input; bad["paid"] = 1
    _ = try mapper.normalize(type: "Shift", id: "s1", fields: bad)
  }
  checkThrows("bool for number", contains: "Shift.tips must be a number") {
    var bad = input; bad["tips"] = true
    _ = try mapper.normalize(type: "Shift", id: "s1", fields: bad)
  }
  checkThrows("mixed list", contains: "Shift.tags must be a list of strings") {
    var bad = input; bad["tags"] = ["a", 1]
    _ = try mapper.normalize(type: "Shift", id: "s1", fields: bad)
  }

  // Round trip through a CKRecord, after a JSON round trip like the outbox does.
  let stored = try JSONSerialization.jsonObject(with: JSONSerialization.data(withJSONObject: normalized)) as! [String: Any]
  let record = CKRecord(recordType: "Shift", recordID: CKRecord.ID(recordName: RecordName.make(type: "Shift", id: "s1"), zoneID: zone))
  record["fromNewerApp"] = "keep me" as NSString
  let modifiedAt = Date(timeIntervalSince1970: 1_700_000_100)
  try mapper.apply(fields: stored, modifiedAt: modifiedAt, to: record)

  check((record["date"] as? Date)?.timeIntervalSince1970 == 1_700_000_000, "date is a Date in the record")
  check((record["hours"] as? NSNumber)?.int64Value == 3, "int in the record")
  check((record["venue"] as? CKRecord.Reference)?.recordID.recordName == "Venue.v1", "reference points to Venue.v1")
  check((record["venue"] as? CKRecord.Reference)?.recordID.zoneID == zone, "reference is in the same zone")
  check(record["photo"] is CKAsset, "asset is a CKAsset")
  check(record["note"] == nil, "empty optional is not set")
  check(record["fromNewerApp"] as? String == "keep me", "unknown fields are kept")
  check(record[RecordMapper.modifiedAtKey] as? Date == modifiedAt, "modifiedAt is set")

  var savedAssets: [String] = []
  let read = try mapper.read(record) { target in
    savedAssets.append("\(target.type)/\(target.id)/\(target.field).\(target.fileExtension)")
    return "/saved/photo"
  }!
  check(read.type == "Shift" && read.id == "s1", "read type and id")
  check(read.fields["date"] as? Double == 1_700_000_000_000, "date comes back as milliseconds")
  check(read.fields["tips"] as? Double == 12.5, "double comes back")
  check(read.fields["hours"] as? Int64 == 3, "int comes back")
  check(read.fields["paid"] as? Bool == true, "bool comes back")
  check(read.fields["tags"] as? [String] == ["a", "b"], "list comes back")
  check(read.fields["venue"] as? String == "v1", "reference comes back as the id")
  check(read.fields["note"] is NSNull, "empty optional comes back as NSNull")
  check(read.fields["photo"] as? String == "/saved/photo" && savedAssets == ["Shift/s1/photo.txt"], "asset is saved with its extension")
  check(record[RecordMapper.assetExtensionKey("photo")] as? String == "txt", "asset extension is stored next to it")
  check(read.fields["fromNewerApp"] == nil, "unknown fields are not sent to JS")
  check(read.modifiedAt == modifiedAt, "modifiedAt comes back")

  // Clearing an optional field removes it.
  var cleared = stored; cleared["photo"] = NSNull()
  try mapper.apply(fields: cleared, modifiedAt: modifiedAt, to: record)
  check(record["photo"] == nil, "null clears an optional field")
  check(record[RecordMapper.assetExtensionKey("photo")] == nil, "clearing an asset clears its extension")

  // Records of a type this app doesn't know are skipped.
  let foreign = CKRecord(recordType: "Other", recordID: CKRecord.ID(recordName: "Other.x", zoneID: zone))
  check(try mapper.read(foreign) { _ in nil } == nil, "unknown record types are skipped")
}
