//! Writes the position and rotation-center attributes of a picture frame.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
pub const Tag = struct { node: usize, bytes: []u8 };
pub const Update = struct { offsets: [2]i32, center: [2]u32 };
pub fn signed(raw: i64) !i32 {
    if (raw < std.math.minInt(i32) or raw > std.math.maxInt(u32)) return error.InvalidPictureOffset;
    return if (raw < 0) @intCast(raw) else @bitCast(@as(u32, @intCast(raw)));
}
fn equal(a: std.mem.Allocator, raw: @import("../xml/attribute_value.zig").Value, value: i32) !bool {
    return try signed(try fields.margin(a, raw, 4096)) == value;
}
fn serialize(a: std.mem.Allocator, quote: u8, value: i32) ![]u8 {
    return std.fmt.allocPrint(a, "{c}{d}{c}", .{ quote, value, quote });
}
pub fn tags(a: std.mem.Allocator, tree: *const Tree, picture: usize, update: Update, limit: usize) ![2]Tag {
    _ = try @import("picture_geometry_values.zig").read(a, tree, picture);
    var missing: usize = 0;
    var duplicate: usize = 0;
    const node = fields.uniqueChild(tree, picture, "pos", &missing, &duplicate) orelse return error.MissingPicturePosition;
    if (duplicate != 0) return error.DuplicatePictureGeometryChild;
    const position = try @import("xml_numeric_attributes_write.zig").write(a, tree, node, &.{ "horzOffset", "vertOffset" }, i32, update.offsets, equal, serialize, limit);
    errdefer a.free(position);
    const rotation = fields.uniqueChild(tree, picture, "rotationInfo", &missing, &duplicate) orelse return error.MissingPictureRotation;
    if (duplicate != 0) return error.DuplicatePictureGeometryChild;
    const center = try @import("xml_unsigned_attributes_write.zig").write(a, tree, rotation, &.{ "centerX", "centerY" }, update.center, limit);
    return .{ .{ .node = node, .bytes = position }, .{ .node = rotation, .bytes = center } };
}
