const records = @import("records.zig");
const header = @import("header.zig");
const header_payload = @import("header_payload.zig");
const eof = @import("eof.zig");

pub const Summary = struct { header: header.Header, header_payload: header_payload.Payload, eof: eof.Eof, records: usize };

pub fn validate(bytes: []const u8) !Summary {
    var iterator: records.Iterator = .{ .bytes = bytes };
    const first = (try iterator.next()) orelse return error.MissingEmfHeader;
    const value = try header.parse(first, bytes.len);
    const payload = try header_payload.parse(first, value);
    var count: usize = 1;
    while (try iterator.next()) |record| {
        count += 1;
        if (record.kind == 1) return error.DuplicateEmfHeader;
        if (record.kind != 14) continue;
        const terminal = try eof.parse(record);
        if (iterator.offset != bytes.len) return error.DataAfterEmfEof;
        if (count != value.records) return error.InvalidEmfDeclaredRecords;
        return .{ .header = value, .header_payload = payload, .eof = terminal, .records = count };
    }
    return error.MissingEmfEof;
}
