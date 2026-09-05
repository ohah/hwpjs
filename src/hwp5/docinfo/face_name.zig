const Reader = @import("../../binary/reader.zig").Reader;
const string = @import("../utf16_string.zig");
pub const Substitute = struct { kind: u8, name_utf16: []const u8 };
pub const FaceName = struct {
    attributes: u8,
    name_utf16: []const u8,
    substitute: ?Substitute,
    /// Ten bytes in spec order (family, serif, weight, proportion, contrast,
    /// stroke variation, arm style, letterform, midline, x-height).
    type_info: ?[10]u8,
    default_utf16: ?[]const u8,
    extra: []const u8,

    pub fn parse(bytes: []const u8) !FaceName {
        var r: Reader = .{ .bytes = bytes };
        const attributes = try r.readInt(u8);
        const name = try string.read(&r);
        const substitute: ?Substitute = if (attributes & 0x80 != 0) .{ .kind = try r.readInt(u8), .name_utf16 = try string.read(&r) } else null;
        const type_info = if (attributes & 0x40 != 0) (try r.take(10))[0..10].* else null;
        const default = if (attributes & 0x20 != 0) try string.read(&r) else null;
        return .{ .attributes = attributes, .name_utf16 = name, .substitute = substitute, .type_info = type_info, .default_utf16 = default, .extra = bytes[r.offset..] };
    }
};
