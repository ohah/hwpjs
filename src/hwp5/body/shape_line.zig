const Reader = @import("../../binary/reader.zig").Reader;
pub const tag: u10 = 78;
/// Table 92 ordinary line payload. Connector ($col) payloads have a different tail.
pub const Line = struct {
    start_x: i32,
    start_y: i32,
    end_x: i32,
    end_y: i32,
    attributes: u16,
    extra: []const u8,
    pub fn parse(bytes: []const u8) !Line {
        var r: Reader = .{ .bytes = bytes };
        return .{
            .start_x = try r.readInt(i32),
            .start_y = try r.readInt(i32),
            .end_x = try r.readInt(i32),
            .end_y = try r.readInt(i32),
            .attributes = try r.readInt(u16),
            .extra = bytes[r.offset..],
        };
    }
};
