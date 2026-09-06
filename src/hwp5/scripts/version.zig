const Reader = @import("../../binary/reader.zig").Reader;
/// Borrowed wire version. Unknown versions and extension bytes are not discarded.
pub const Version = struct {
    high: u32,
    low: u32,
    extra: []const u8,
    pub fn parse(bytes: []const u8) !Version {
        var r: Reader = .{ .bytes = bytes };
        return .{ .high = try r.readInt(u32), .low = try r.readInt(u32), .extra = bytes[r.offset..] };
    }
};
