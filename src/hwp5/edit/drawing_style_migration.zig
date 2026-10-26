//! Explicit observed empty-fill style draft; never a component/container rewrite.
const std = @import("std");
const Version = @import("../version.zig").Version;
const Style = @import("../body/drawing_style.zig").Style;
pub const Values = struct {
    shadow: @import("../body/shadow.zig").Shadow,
    metadata: @import("../body/drawing_metadata.zig").Metadata,
};

pub fn validateSource(input: []const u8) !void {
    const source = try Style.parseWithTail(input, .observed13, .fill_only);
    if (source.fill.flags != 0 or source.fill.data != .known or source.fill.data.known.additional.len != 0 or source.tail != .fill_only or source.tail.fill_only.len != 0) return error.UnsupportedDrawingMigrationSource;
}

pub fn prepare(a: std.mem.Allocator, input: []const u8, from: Version, to: Version, explicit: ?Values, limit: usize) ![]u8 {
    if (from.raw != 0x05000107 or to.raw != 0x05000300) return error.UnsupportedDrawingMigrationTarget;
    try validateSource(input);
    const values = explicit orelse return error.MissingDrawingMigrationValues;
    // This observed source has no shadow. Creating an active shadow is an edit,
    // not an equivalent conversion. Identity must be allocated by the caller.
    if (values.shadow.kind != 0 or values.metadata.instance_id == 0 or values.metadata.reserved != 0) return error.UnsupportedDrawingMigrationValues;
    const length = std.math.add(usize, input.len, 22) catch return error.LimitExceeded;
    if (length > limit) return error.LimitExceeded;
    const out = try a.alloc(u8, length);
    errdefer a.free(out);
    @memcpy(out[0..input.len], input);
    const tail = out[input.len..];
    std.mem.writeInt(u32, tail[0..4], values.shadow.kind, .little);
    std.mem.writeInt(u32, tail[4..8], values.shadow.color, .little);
    std.mem.writeInt(i32, tail[8..12], values.shadow.offset_x, .little);
    std.mem.writeInt(i32, tail[12..16], values.shadow.offset_y, .little);
    std.mem.writeInt(u32, tail[16..20], values.metadata.instance_id, .little);
    tail[20] = values.metadata.reserved;
    tail[21] = values.metadata.shadow_alpha;
    const target = try Style.parseWithTail(out, .observed13, .alpha_shadow_metadata);
    if (target.tail != .known or target.tail.known.extra.len != 0) return error.UnsupportedDrawingMigrationSource;
    return out;
}
