//! Detached OLE shape metadata. Does not activate or interpret the embedded program.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const geometry = @import("picture_geometry_values.zig");
const position = @import("picture_position_values.zig");
const flow = @import("picture_flow_values.zig");
const fields = @import("table_xml_fields.zig");

pub const Values = struct {
    geometry: geometry.Values,
    position: position.Values,
    flow: flow.Values,
    binary_item_id: ?[]u8 = null,
    object_type: ?[]u8 = null,
    draw_aspect: ?[]u8 = null,
    has_moniker: ?bool = null,
    transform_identity: ?bool = null,

    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        if (self.binary_item_id) |value| a.free(value);
        if (self.object_type) |value| a.free(value);
        if (self.draw_aspect) |value| a.free(value);
        self.* = undefined;
    }
};

fn text(a: std.mem.Allocator, tree: *const Tree, node: usize, name: []const u8) !?[]u8 {
    const raw = (try tree.attributeValue(a, node, "", name)) orelse return null;
    return try raw.toUtf8(a, 4096);
}

pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize) !Values {
    var result: Values = .{
        .geometry = try geometry.readOle(a, tree, node),
        .position = try position.readOle(a, tree, node),
        .flow = try flow.readOle(a, tree, node),
    };
    errdefer result.deinit(a);
    var transform = try @import("picture_transform_values.zig").readOle(a, tree, node, 1024);
    defer transform.deinit(a);
    result.transform_identity = @import("picture_transform_values.zig").rectangleIdentity(&transform);
    result.binary_item_id = try text(a, tree, node, "binaryItemIDRef");
    result.object_type = try text(a, tree, node, "objectType");
    result.draw_aspect = try text(a, tree, node, "drawAspect");
    if (try tree.attributeValue(a, node, "", "hasMoniker")) |raw| result.has_moniker = try fields.boolean(a, raw, 4096);
    return result;
}
