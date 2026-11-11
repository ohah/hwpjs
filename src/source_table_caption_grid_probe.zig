const std = @import("std");
const a = std.testing.allocator;
const h5 = @import("hwp5/edit/source_table_grid.zig");
const hx = @import("hwpx/source_table_grid.zig");
const h5_bytes = blk: {
    @setEvalBranchQuota(100000);
    const hex = std.mem.trim(u8, @embedFile("testing/fixtures/source-caption-top.hex"), " \r\n\t");
    var data: [hex.len / 2]u8 = undefined;
    _ = std.fmt.hexToBytes(&data, hex) catch unreachable;
    break :blk data;
};
const h5_source = &h5_bytes;
const hx_source = @embedFile("testing/fixtures/source-caption-bottom.xml");
const version = @import("hwp5/version.zig").Version{ .raw = 0x05000302 };
const fresh = [_]u32{ 1000, 1001, 1002 };
const commands = [_]@import("model/table_grid_edit_plan.zig").Command{ .{ .insert_row = 1 }, .{ .delete_row = 0 }, .{ .insert_column = 1 }, .{ .delete_column = 0 } };
fn h5Target(allocator: std.mem.Allocator) !usize {
    var tree = try @import("hwp5/edit/source_tree.zig").parse(allocator, h5_source, version, .{});
    defer tree.deinit(allocator);
    for (tree.nodes, 0..) |node, i| if (node.record.value == .table) return i;
    return error.MissingTestTable;
}
fn h5Caption(allocator: std.mem.Allocator, source: []const u8) ![]u8 {
    var tree = try @import("hwp5/edit/source_tree.zig").parse(allocator, source, version, .{});
    defer tree.deinit(allocator);
    for (tree.nodes, 0..) |node, i| if (node.record.value == .control_header and node.record.value.control_header.id == @import("hwp5/body/control_rules.zig").table_id) {
        var lists = try @import("hwp5/body/table_lists.zig").Iterator.init(tree, i);
        const entry = lists.next() orelse return error.MissingTestCaption;
        if (entry.kind != .caption) return error.MissingTestCaption;
        return allocator.dupe(u8, source[tree.nodes[entry.node].record.framing.offset..tree.nodes[lists.table_node].record.framing.offset]);
    };
    return error.MissingTestCaption;
}
fn hxTarget(allocator: std.mem.Allocator) !usize {
    var tree = try @import("hwpx/section_tree.zig").parse(allocator, hx_source, 0, 0, .{});
    defer tree.deinit(allocator);
    for (tree.elements, 0..) |_, i| if (@import("hwpx/table_xml_fields.zig").childIs(&tree, i, "tbl")) return i;
    return error.MissingTestTable;
}
fn hxCaption(allocator: std.mem.Allocator, source: []const u8) ![]u8 {
    var tree = try @import("hwpx/section_tree.zig").parse(allocator, source, 0, 0, .{});
    defer tree.deinit(allocator);
    for (tree.elements, 0..) |_, i| if (@import("hwpx/table_xml_fields.zig").childIs(&tree, i, "tbl")) {
        const c = (try @import("hwpx/table_caption_values.zig").read(allocator, &tree, i)) orelse return error.MissingTestCaption;
        return allocator.dupe(u8, tree.sourceOf(c.caption_node));
    };
    return error.MissingTestCaption;
}
fn h5Edit(allocator: std.mem.Allocator, target: usize, c: h5.Request) !void {
    _ = target;
    const out = try h5.prepare(allocator, h5_source, version, c, .{});
    defer allocator.free(out);
    const before = try h5Caption(allocator, h5_source);
    defer allocator.free(before);
    const after = try h5Caption(allocator, out);
    defer allocator.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}
fn hxEdit(allocator: std.mem.Allocator, c: hx.Request) !void {
    const out = try hx.prepare(allocator, hx_source, c);
    defer allocator.free(out);
    const before = try hxCaption(allocator, hx_source);
    defer allocator.free(before);
    const after = try hxCaption(allocator, out);
    defer allocator.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}
test "source caption HWP5 typed prefix and paragraph groups survive four actions and every allocation failure" {
    const target = try h5Target(a);
    for (commands) |command| {
        const request: h5.Request = .{ .table_node = target, .expected_rows = 3, .expected_columns = 3, .command = command, .layout = .observed8, .new_paragraph_ids = if (command == .insert_row or command == .insert_column) &fresh else &.{} };
        try h5Edit(a, target, request);
        try @import("testing/allocation_failures.zig").check(h5Edit, .{ target, request });
    }
}
test "source caption HWPX typed direct list and original trailing sibling survive four actions and every allocation failure" {
    const target = try hxTarget(a);
    for (commands) |command| {
        const request: hx.Request = .{ .target = .{ .element = target }, .expected_rows = 3, .expected_columns = 3, .command = command, .fresh_paragraph_ids = if (command == .insert_row or command == .insert_column) &fresh else &.{} };
        try hxEdit(a, request);
        try @import("testing/allocation_failures.zig").check(hxEdit, .{request});
    }
}
test "source caption HWP5 declaration must match typed ownership without repair" {
    const target = try h5Target(a);
    const before = try a.dupe(u8, h5_source);
    defer a.free(before);
    var tree = try @import("hwp5/edit/source_tree.zig").parse(a, h5_source, version, .{});
    defer tree.deinit(a);
    const owner = tree.nodes[target].parent.?;
    const offset = tree.nodes[owner].record.framing.offset + (tree.nodes[owner].record.framing.raw.len - tree.nodes[owner].record.framing.payload.len) + 4;
    const flags = std.mem.readInt(u32, before[offset..][0..4], .little);
    std.mem.writeInt(u32, before[offset..][0..4], flags & ~(@as(u32, 1) << 29), .little);
    try std.testing.expectError(error.UnsupportedSourceTableGrid, h5.prepare(a, before, version, .{ .table_node = target, .expected_rows = 3, .expected_columns = 3, .command = .{ .insert_row = 1 }, .layout = .observed8, .new_paragraph_ids = &fresh }, .{}));
}
