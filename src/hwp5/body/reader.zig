const framing = @import("../record.zig");
const Version = @import("../version.zig").Version;
pub const Header = @import("paragraph_header.zig").Header;
pub const text = @import("text.zig");
pub const Text = text.Text;
pub const Tag = enum(u10) { paragraph_header = 66, paragraph_text = 67 };
pub const Value = union(enum) { header: Header, text: Text, unknown };
pub const Record = struct { framing: framing.Record, value: Value };
/// Payload decoding only. Nested paragraphs keep their original levels.
/// Ownership/order/count/DocInfo references need a separate section assembler.
pub const Iterator = struct {
    records: framing.Iterator,
    version: Version,
    pub fn init(bytes: []const u8, version: Version, options: framing.Options) !Iterator {
        try version.requireSupported();
        return .{ .records = framing.Iterator.init(bytes, options), .version = version };
    }
    pub fn next(self: *Iterator) !?Record {
        var candidate = self.records;
        const r = (try candidate.next()) orelse return null;
        const value: Value = switch (r.tag) {
            @intFromEnum(Tag.paragraph_header) => .{ .header = try Header.parse(r.payload, self.version) },
            @intFromEnum(Tag.paragraph_text) => .{ .text = try Text.parse(r.payload) },
            else => .unknown,
        };
        self.records = candidate;
        return .{ .framing = r, .value = value };
    }
};
