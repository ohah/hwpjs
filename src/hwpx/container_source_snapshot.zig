//! 컨테이너 자체 원값입니다. 부모 좌표 합성이나 크기 상속은 하지 않습니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
pub const Child = struct { node: usize, namespace_uri: []const u8, local_name: []u8 };
fn localName(a: std.mem.Allocator, view: @import("xml_part_tree.zig").Element) ![]u8 {
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(a);
    var offset: usize = 0;
    while (try @import("../xml/scalars.zig").read(view.name.local.raw, offset, view.name.local.encoding)) |scalar| {
        var buffer: [4]u8 = undefined;
        const length = try std.unicode.utf8Encode(@intCast(scalar.value), &buffer);
        try bytes.appendSlice(a, buffer[0..length]);
        offset = scalar.end;
    }
    return bytes.toOwnedSlice(a);
}
pub const Snapshot = struct {
    container_node: usize,
    group_context: ?@import("grouped_shape_context.zig").Context,
    geometry: @import("picture_geometry_values.zig").Values,
    position: @import("picture_position_values.zig").Values,
    flow: @import("picture_flow_values.zig").Values,
    transform: @import("picture_transform_values.zig").Values,
    children: []Child,
    has_caption: bool,
    caption: ?@import("table_caption_values.zig").Values,

    pub fn deinit(self: *Snapshot, a: std.mem.Allocator) void {
        self.transform.deinit(a);
        for (self.children) |child| a.free(child.local_name);
        a.free(self.children);
        self.* = undefined;
    }
};

pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize) !Snapshot {
    const geometry = try @import("picture_geometry_values.zig").readContainer(a, tree, node);
    const position = try @import("picture_position_values.zig").readContainer(a, tree, node);
    const flow = try @import("picture_flow_values.zig").readContainer(a, tree, node);
    const context = try @import("grouped_shape_context.zig").read(tree, node);
    const caption = try @import("table_caption_values.zig").readContainer(a, tree, node);
    var children: std.ArrayList(usize) = .empty;
    defer children.deinit(a);
    for (tree.elements, 0..) |element, index| {
        if (element.parent == node) try children.append(a, index);
    }
    const child_nodes = try children.toOwnedSlice(a);
    defer a.free(child_nodes);
    const child_sources = try a.alloc(Child, child_nodes.len);
    var initialized: usize = 0;
    errdefer {
        for (child_sources[0..initialized]) |child| a.free(child.local_name);
        a.free(child_sources);
    }
    for (child_nodes, 0..) |index, i| {
        child_sources[i] = .{ .node = index, .namespace_uri = tree.elements[index].name.uri, .local_name = try localName(a, tree.elements[index]) };
        initialized += 1;
    }
    return .{
        .container_node = node,
        .group_context = context,
        .geometry = geometry,
        .position = position,
        .flow = flow,
        .transform = try @import("picture_transform_values.zig").readContainer(a, tree, node, 1024),
        .children = child_sources,
        .has_caption = caption != null,
        .caption = caption,
    };
}

test "HWPX container source snapshot actual values and allocation failures" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapecontainer-2.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const tree = &session.sections[0].tree;
    for ([_]usize{ 31, 82 }) |node| {
        var value = try read(a, tree, node);
        defer value.deinit(a);
        try std.testing.expect(value.transform.matrices.len > 0);
        if (node == 31) {
            try std.testing.expect(value.group_context == null);
            try std.testing.expectEqual(@as(?u32, 59528), value.geometry.width);
        } else {
            try std.testing.expectEqual(@as(usize, 31), value.group_context.?.root_anchor);
            try std.testing.expect(value.geometry.width == null);
        }
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, source: *const Tree, index: usize) !void {
                var snapshot = try read(allocator, source, index);
                defer snapshot.deinit(allocator);
                const json = try std.json.Stringify.valueAlloc(allocator, snapshot, .{});
                defer allocator.free(json);
                try std.testing.expect(json.len > 0);
            }
        }.run, .{ tree, node });
    }
}
