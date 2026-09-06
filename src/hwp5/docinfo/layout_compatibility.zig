const Reader = @import("../../binary/reader.zig").Reader;
/// Table 56 defines five DWORDs, but not their bit meanings. Preserve every bit.
pub const LayoutCompatibility = struct {
    character: u32,
    paragraph: u32,
    section: u32,
    object: u32,
    field: u32,
    extra: []const u8,
    pub fn parse(bytes: []const u8) !LayoutCompatibility {
        var r: Reader = .{ .bytes = bytes };
        return .{ .character = try r.readInt(u32), .paragraph = try r.readInt(u32), .section = try r.readInt(u32), .object = try r.readInt(u32), .field = try r.readInt(u32), .extra = bytes[r.offset..] };
    }
};
