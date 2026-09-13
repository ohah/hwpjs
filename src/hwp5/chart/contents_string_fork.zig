const std = @import("std");
const Contents = @import("observed_contents.zig").Contents;
const Font = @import("font.zig").Font;
const ids = @import("object_ids.zig");
const patches = @import("contents_patch.zig");

/// Replaces one existing Font String alias with a new inline String definition.
/// The caller selects the new object ID; existing aliases remain unchanged.
pub fn forkFontName(a: std.mem.Allocator, value: *const Contents, font: *const Font, new_object_id: u32, bytes: []const u8, trailer: u8, max_output_bytes: usize) ![]u8 {
    if (bytes.len > std.math.maxInt(u16)) return error.LimitExceeded;
    try ids.requireInline(new_object_id);
    if (value.prefix.objects.entries.contains(new_object_id)) return error.DuplicateChartObjectId;
    if (new_object_id == font.object_id) return error.UnsupportedChartObjectReference;
    if (font.name_introduced) return error.UnsupportedChartStringForkTarget;

    const source = value.source;
    if (font.name_start > font.name_end or font.name_end > source.len or font.name_end - font.name_start != 4)
        return error.InvalidChartStringReferenceSpan;
    if (std.mem.readInt(u32, source[font.name_start..][0..4], .little) != font.name.object_id)
        return error.InvalidChartStringReferenceSpan;
    const original = value.prefix.objects.entries.get(font.name.object_id) orelse return error.InvalidChartStringReferenceSpan;
    switch (original) {
        .string => |string| if (string.object_id != font.name.object_id) return error.InvalidChartStringReferenceSpan,
        else => return error.InvalidChartStringReferenceSpan,
    }

    const types = &value.prefix.grid.prelude.types;
    const string_type = types.findLowestId("VtString\x00", 1) orelse return error.MissingChartStringForkType;
    const value_type = types.findLowestId("VtValue\x00", 1) orelse return error.MissingChartStringForkType;
    const object_type = types.findLowestId("VtObject\x00", 1) orelse return error.MissingChartStringForkType;

    const replacement = try a.alloc(u8, bytes.len + 19);
    defer a.free(replacement);
    std.mem.writeInt(u32, replacement[0..4], new_object_id, .little);
    std.mem.writeInt(u32, replacement[4..8], string_type, .little);
    std.mem.writeInt(u16, replacement[8..10], @intCast(bytes.len), .little);
    @memcpy(replacement[10..][0..bytes.len], bytes);
    replacement[10 + bytes.len] = trailer;
    std.mem.writeInt(u32, replacement[11 + bytes.len ..][0..4], value_type, .little);
    std.mem.writeInt(u32, replacement[15 + bytes.len ..][0..4], object_type, .little);
    return patches.applyOriginal(a, value, &.{.{ .start = font.name_start, .end = font.name_end, .replacement = replacement }}, max_output_bytes);
}
