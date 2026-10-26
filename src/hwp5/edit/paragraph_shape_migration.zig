//! One owned paragraph-shape transition; no document/header writes.
const std = @import("std");
const Version = @import("../version.zig").Version;
const Shape = @import("../docinfo/para_shape.zig").ParaShape;

pub fn prepare(a: std.mem.Allocator, input: []const u8, from: Version, to: Version, absent_attributes2: ?u32, limit: usize) ![]u8 {
    if (to.raw != 0x05000300 or from.raw > to.raw) return error.UnsupportedParagraphMigrationTarget;
    const shape = try Shape.parse(input, from);
    if (shape.extra.len != 0 or shape.level != null) return error.UnsupportedParagraphMigrationTail;
    const attributes2 = if (shape.attributes2) |value| blk: {
        if (absent_attributes2 != null) return error.UnexpectedParagraphMigrationDefault;
        break :blk value;
    } else absent_attributes2 orelse return error.MissingParagraphMigrationDefault;
    if (Shape.modern_size > limit) return error.LimitExceeded;
    if (shape.modern_spacing != null) return a.dupe(u8, input);
    const kind = shape.attributes & 3;
    // Old kind 3 was not the new minimum-spacing kind. Do not reinterpret it.
    if (kind > 2) return error.UnsupportedLegacyParagraphSpacing;
    const output = try a.alloc(u8, Shape.modern_size);
    @memcpy(output[0..Shape.base_size], input[0..Shape.base_size]);
    std.mem.writeInt(u32, output[Shape.attributes2_offset..][0..4], attributes2, .little);
    std.mem.writeInt(u32, output[Shape.modern_spacing_offset..][0..4], kind, .little);
    std.mem.writeInt(i32, output[Shape.modern_spacing_offset + 4 ..][0..4], shape.legacy_spacing, .little);
    return output;
}
