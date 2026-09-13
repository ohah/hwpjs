const std = @import("std");
const Contents = @import("observed_contents.zig").Contents;
const ids = @import("object_ids.zig");

/// Serializes an inline String using type IDs already declared before the
/// insertion position. Identity and insertion-position validation belong to
/// the caller because definition relocation intentionally reuses an ID.
pub fn serializeKnown(a: std.mem.Allocator, value: *const Contents, object_id: u32, bytes: []const u8, trailer: u8) ![]u8 {
    if (bytes.len > std.math.maxInt(u16)) return error.LimitExceeded;
    try ids.requireInline(object_id);
    const types = &value.prefix.grid.prelude.types;
    const string_type = types.findLowestId("VtString\x00", 1) orelse return error.MissingChartStringForkType;
    const value_type = types.findLowestId("VtValue\x00", 1) orelse return error.MissingChartStringForkType;
    const object_type = types.findLowestId("VtObject\x00", 1) orelse return error.MissingChartStringForkType;

    const replacement = try a.alloc(u8, bytes.len + 19);
    errdefer a.free(replacement);
    std.mem.writeInt(u32, replacement[0..4], object_id, .little);
    std.mem.writeInt(u32, replacement[4..8], string_type, .little);
    std.mem.writeInt(u16, replacement[8..10], @intCast(bytes.len), .little);
    @memcpy(replacement[10..][0..bytes.len], bytes);
    replacement[10 + bytes.len] = trailer;
    std.mem.writeInt(u32, replacement[11 + bytes.len ..][0..4], value_type, .little);
    std.mem.writeInt(u32, replacement[15 + bytes.len ..][0..4], object_type, .little);
    return replacement;
}
