//! Detached OLE shape metadata. Does not activate or interpret the embedded program.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const geometry = @import("picture_geometry_values.zig");
const position = @import("picture_position_values.zig");
const flow = @import("picture_flow_values.zig");
const fields = @import("table_xml_fields.zig");

pub const AxisFrame = struct { original: [2]u32, current: [2]u32, matrix: [6]f64, angle: u32, flip: [2]bool, reverse: ?bool, offset: [2]i32 };
pub const Values = struct {
    axis_frame: ?AxisFrame = null,
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
    result.axis_frame = axisFrame(a, tree, node, &transform) catch |err| switch (err) {
        error.OutOfMemory => return err,
        else => null,
    };
    return result;
}
fn axisFrame(a: std.mem.Allocator, tree: *const Tree, node: usize, transform: *const @import("picture_transform_values.zig").Values) !?AxisFrame {
    if (@import("run_anchor.zig").kind(tree, node) != .ole) {
        const branch = tree.elements[node].parent orelse return null;
        const wrapper = tree.elements[branch].parent orelse return null;
        const pair = @import("chart_pair_target.zig").objects(tree, wrapper) catch return null;
        if (pair.ole != node) return null;
    }
    var dimensions: [2][2]u32 = undefined;
    for ([_][]const u8{ "orgSz", "curSz" }, &dimensions) |name, *size| {
        var missing: usize = 0;
        var duplicate: usize = 0;
        const child = fields.uniqueChild(tree, node, name, &missing, &duplicate) orelse return null;
        if (duplicate != 0) return null;
        const pair = try fields.optionalUnsignedPair(a, tree, child, .{ "width", "height" }, 4096);
        size.* = .{ pair[0] orelse return null, pair[1] orelse return null };
        if (size[0] == 0 or size[1] == 0) return null;
    }
    var missing: usize = 0;
    var duplicate: usize = 0;
    const offset = fields.uniqueChild(tree, node, "offset", &missing, &duplicate) orelse return null;
    if (duplicate != 0) return null;
    const x = (try tree.attributeValue(a, offset, "", "x")) orelse return null;
    const y = (try tree.attributeValue(a, offset, "", "y")) orelse return null;
    return .{ .original = dimensions[0], .current = dimensions[1], .matrix = try @import("picture_transform_affine.zig").renderingMatrix(transform), .angle = transform.angle orelse return null, .flip = .{ transform.flip[0] orelse return null, transform.flip[1] orelse return null }, .reverse = transform.reverse, .offset = .{ try @import("picture_frame_write.zig").signed(try fields.margin(a, x, 4096)), try @import("picture_frame_write.zig").signed(try fields.margin(a, y, 4096)) } };
}

/// 별도 읽기 진단입니다. 기존 read의 오류·wire와 setter 권한을 바꾸지 않습니다.
/// 정확한 직접 run OLE 소유권과 nullable 원값은 진단 모듈이 검사합니다.
pub fn readOutsideMarginDomain(a: std.mem.Allocator, tree: *const Tree, node: usize) !@import("ole_outside_margin_domain.zig").Report {
    return @import("ole_outside_margin_domain.zig").read(a, tree, node);
}
