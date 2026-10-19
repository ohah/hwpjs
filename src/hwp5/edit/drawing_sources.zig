//! Original top-level drawing geometry; current text and page placement remain separate.
const std = @import("std");
pub const Source = struct {
    control_node: usize,
    component_node: usize,
    paragraph_node: usize,
    kind_id: u32,
    flags: u32,
    offset_x: i32,
    offset_y: i32,
    width: u32,
    height: u32,
    instance_id: u32,
    z_order: i32,
    outer_margins: [4]i16,
    prevent_page_break: i32,
    description_bytes: ?usize,
    object_extra_bytes: usize,
    component_offset_x: i32,
    component_offset_y: i32,
    original_width: u32,
    original_height: u32,
    current_width: u32,
    current_height: u32,
    component_attributes: u32,
    rotation_angle: i16,
    matrix_pairs: usize,
    component_extra_bytes: usize,
};
pub fn read(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version) ![]Source {
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    const component = @import("../body/shape_component.zig");
    var out: std.ArrayList(Source) = .empty;
    errdefer out.deinit(a);
    for (tree.nodes, 0..) |node, index| {
        if (node.record.value != .control_header or node.record.value.control_header.id != @import("../body/control_rules.zig").drawing_id) continue;
        const parent = node.parent orelse return error.OrphanDrawingControl;
        if (tree.nodes[parent].record.value != .header) return error.InvalidDrawingOwner;
        const child = (try @import("../body/owned_record.zig").find(tree, index, component.tag)) orelse return error.MissingShapeComponent;
        const shape = try component.Component.parse(tree.nodes[child].record.framing.payload, .double_id);
        const common = try @import("../body/object_common.zig").parseControl(node.record.value.control_header);
        try out.append(a, .{ .control_node = index, .component_node = child, .paragraph_node = parent, .kind_id = shape.id, .flags = common.flags, .offset_x = common.offset_x, .offset_y = common.offset_y, .width = common.width, .height = common.height, .instance_id = common.instance_id, .z_order = common.z_order, .outer_margins = common.margins, .prevent_page_break = common.prevent_page_break, .description_bytes = if (common.description_utf16) |text| text.len else null, .object_extra_bytes = common.extra.len, .component_offset_x = shape.offset_x, .component_offset_y = shape.offset_y, .original_width = shape.original_width, .original_height = shape.original_height, .current_width = shape.current_width, .current_height = shape.current_height, .component_attributes = shape.attributes, .rotation_angle = shape.rotation_angle, .matrix_pairs = shape.rendering.pairs.count(), .component_extra_bytes = shape.extra.len });
    }
    return out.toOwnedSlice(a);
}
test "HWP5 drawing sources actual geometry allocation failures" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "shaperect", "textbox", "matrix" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(8_000_000));
        defer a.free(input);
        var source = try @import("../text_source.zig").Source.open(a, input);
        defer source.deinit();
        const bytes = try source.decodeSection(a, 0);
        defer a.free(bytes);
        const expected = try read(a, bytes, source.header.version());
        defer a.free(expected);
        try std.testing.expect(expected.len > 0);
        var tree = try @import("source_tree.zig").parse(a, bytes, source.header.version(), .{});
        defer tree.deinit(a);
        for (expected) |row| {
            const payload = tree.nodes[row.control_node].record.framing.payload;
            try std.testing.expectEqual(std.mem.readInt(u32, payload[4..8], .little), row.flags);
            try std.testing.expectEqual(std.mem.readInt(i32, payload[8..12], .little), row.offset_y);
            try std.testing.expectEqual(std.mem.readInt(i32, payload[12..16], .little), row.offset_x);
            try std.testing.expectEqual(std.mem.readInt(u32, payload[16..20], .little), row.width);
            try std.testing.expectEqual(std.mem.readInt(u32, payload[20..24], .little), row.height);
            try std.testing.expectEqual(std.mem.readInt(u32, payload[36..40], .little), row.instance_id);
            try std.testing.expectEqual(std.mem.readInt(i32, payload[24..28], .little), row.z_order);
            for (row.outer_margins, 0..) |margin, ordinal| try std.testing.expectEqual(std.mem.readInt(i16, payload[28 + ordinal * 2 ..][0..2], .little), margin);
            try std.testing.expectEqual(std.mem.readInt(i32, payload[40..44], .little), row.prevent_page_break);
            const raw_shape = tree.nodes[row.component_node].record.framing.payload;
            try std.testing.expectEqual(std.mem.readInt(u32, raw_shape[0..4], .little), row.kind_id);
            try std.testing.expectEqual(std.mem.readInt(i32, raw_shape[8..12], .little), row.component_offset_x);
            try std.testing.expectEqual(std.mem.readInt(i32, raw_shape[12..16], .little), row.component_offset_y);
            try std.testing.expectEqual(std.mem.readInt(u32, raw_shape[20..24], .little), row.original_width);
            try std.testing.expectEqual(std.mem.readInt(u32, raw_shape[24..28], .little), row.original_height);
            try std.testing.expectEqual(std.mem.readInt(u32, raw_shape[28..32], .little), row.current_width);
            try std.testing.expectEqual(std.mem.readInt(u32, raw_shape[32..36], .little), row.current_height);
            try std.testing.expectEqual(std.mem.readInt(u32, raw_shape[36..40], .little), row.component_attributes);
            try std.testing.expectEqual(std.mem.readInt(i16, raw_shape[40..42], .little), row.rotation_angle);
            const count = std.mem.readInt(u16, raw_shape[50..52], .little);
            try std.testing.expectEqual(count, row.matrix_pairs);
            try std.testing.expectEqual(raw_shape.len - (100 + @as(usize, count) * 96), row.component_extra_bytes);
            // control ID를 flags로 읽은 이전 후보는 이 비교에서 실패합니다.
            try std.testing.expect(row.flags != std.mem.readInt(u32, payload[0..4], .little));
        }
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, rows: []const Source) !void {
                const actual = try read(allocator, raw, version);
                defer allocator.free(actual);
                try std.testing.expectEqualDeep(rows, actual);
            }
        }.run, .{ bytes, source.header.version(), expected });
    }
}
