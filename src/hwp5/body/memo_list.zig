const Reader = @import("../../binary/reader.zig").Reader;
pub const tag: u10 = 93;
/// Observed memo number, not a DocInfo memo-shape ordinal or paragraph count.
pub const Header = struct {
    memo_index: u32,
    extra: []const u8,
    pub fn parse(bytes: []const u8) !Header {
        var r: Reader = .{ .bytes = bytes };
        return .{ .memo_index = try r.readInt(u32), .extra = bytes[r.offset..] };
    }
};
