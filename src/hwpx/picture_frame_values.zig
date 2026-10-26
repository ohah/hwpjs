//! Authoritative position/rotation-center frame; sizes and matrices stay separate.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const geometry = @import("picture_geometry_values.zig");
const writer = @import("picture_frame_write.zig");
pub const Entry = struct { picture_node: usize, update: writer.Update };
pub const Values = std.ArrayList(Entry);
pub fn read(a: std.mem.Allocator, tree: *const Tree, values: *const Values, picture: usize) !geometry.Values {
    var result = try geometry.read(a, tree, picture);
    for (values.items) |entry| if (entry.picture_node == picture) {
        result.horizontal_offset = entry.update.offsets[0];
        result.vertical_offset = entry.update.offsets[1];
        break;
    };
    return result;
}
pub fn set(a: std.mem.Allocator, tree: *const Tree, values: *Values, picture: usize, update: writer.Update, limit: usize) !bool {
    const validated = try writer.tags(a, tree, picture, update, limit);
    defer for (validated) |tag| a.free(tag.bytes);
    const source = try geometry.read(a, tree, picture);
    const fields = @import("table_xml_fields.zig");
    var missing: usize = 0;
    var duplicate: usize = 0;
    const rotation = fields.uniqueChild(tree, picture, "rotationInfo", &missing, &duplicate) orelse return error.MissingPictureRotation;
    if (duplicate != 0) return error.DuplicatePictureGeometryChild;
    const centers = try fields.optionalUnsignedPair(a, tree, rotation, .{ "centerX", "centerY" }, 4096);
    const original: writer.Update = .{ .offsets = .{ try writer.signed(source.horizontal_offset orelse return error.MissingPicturePosition), try writer.signed(source.vertical_offset orelse return error.MissingPicturePosition) }, .center = .{ centers[0] orelse return error.MissingPictureRotation, centers[1] orelse return error.MissingPictureRotation } };
    for (values.items, 0..) |*entry, index| {
        if (entry.picture_node != picture) continue;
        if (std.meta.eql(entry.update, update)) return false;
        if (std.meta.eql(original, update)) {
            _ = values.orderedRemove(index);
        } else entry.update = update;
        return true;
    }
    if (std.meta.eql(original, update)) return false;
    if (values.items.len >= 100000) return error.LimitExceeded;
    try values.append(a, .{ .picture_node = picture, .update = update });
    return true;
}
