const Reader = @import("../../binary/reader.zig").Reader;
pub const Target = enum(u32) { current_hwp = 0, hwp_2007 = 1, ms_word = 2, _ };
pub const CompatibleDocument = struct {
    target: Target,
    extra: []const u8,
    pub fn parse(bytes: []const u8) !CompatibleDocument {
        var r: Reader = .{ .bytes = bytes };
        return .{ .target = @enumFromInt(try r.readInt(u32)), .extra = bytes[r.offset..] };
    }
};
