const records = @import("records.zig");
const header = @import("header.zig");
const header_payload = @import("header_payload.zig");
const path_bracket = @import("path_bracket.zig");
const eof = @import("eof.zig");
const eof_palette = @import("eof_palette.zig");

pub const Summary = struct { header: header.Header, header_payload: header_payload.Payload, eof: eof.Eof, palette: eof_palette.Palette, records: usize };

pub fn validate(bytes: []const u8) !Summary {
    var iterator: records.Iterator = .{ .bytes = bytes };
    var path_state: path_bracket.State = .{};
    const first = (try iterator.next()) orelse return error.MissingEmfHeader;
    const value = try header.parse(first, bytes.len);
    const payload = try header_payload.parse(first, value);
    var count: usize = 1;
    while (try iterator.next()) |record| {
        count += 1;
        if (record.kind == .header) return error.DuplicateEmfHeader;
        _ = try path_state.consume(record);
        if (record.kind != .eof) continue;
        const terminal = try eof.parse(record);
        try path_state.finish();
        if (terminal.palette_entries != value.palette_entries) return error.InvalidEmfPaletteCount;
        const palette = try eof_palette.parse(record, terminal);
        if (iterator.offset != bytes.len) return error.DataAfterEmfEof;
        if (count != value.records) return error.InvalidEmfDeclaredRecords;
        return .{ .header = value, .header_payload = payload, .eof = terminal, .palette = palette, .records = count };
    }
    return error.MissingEmfEof;
}
