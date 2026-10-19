//! Immutable table placement/pagination declarations; not a pixel layout model.
const std = @import("std");
pub const Source = struct {
    table_node: usize,
    table_record_node: usize,
    object_flags: u32,
    offset_y: i32,
    offset_x: i32,
    width: u32,
    height: u32,
    z_order: i32,
    outer_margins: [4]i16,
    instance_id: u32,
    prevent_page_break: i32,
    description_bytes: ?usize,
    object_extra_bytes: usize,
    table_flags: u32,
    rows: u16,
    columns: u16,
    cell_spacing: i16,
    inner_margins: [4]i16,
    border_fill_id: u16,
    zone_count: ?usize,
    table_extra_bytes: usize,
};
pub fn read(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version) ![]Source {
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    var rows: std.ArrayList(Source) = .empty;
    errdefer rows.deinit(a);
    for (tree.nodes, 0..) |node, index| {
        if (node.record.value != .control_header or node.record.value.control_header.id != @import("../body/control_rules.zig").table_id) continue;
        const properties = try @import("../body/object_common.zig").Properties.parse(node.record.value.control_header.properties);
        const lists = try @import("../body/table_lists.zig").Iterator.init(tree, index);
        const table_record = lists.table_node;
        const table = tree.nodes[table_record].record.value.table;
        try rows.append(a, .{ .table_node = index, .table_record_node = table_record, .object_flags = properties.flags, .offset_y = properties.offset_y, .offset_x = properties.offset_x, .width = properties.width, .height = properties.height, .z_order = properties.z_order, .outer_margins = properties.margins, .instance_id = properties.instance_id, .prevent_page_break = properties.prevent_page_break, .description_bytes = if (properties.description_utf16) |bytes| bytes.len else null, .object_extra_bytes = properties.extra.len, .table_flags = table.flags, .rows = table.row_count, .columns = table.column_count, .cell_spacing = table.cell_spacing, .inner_margins = table.margins, .border_fill_id = table.border_fill_id, .zone_count = if (table.zones) |zones| zones.count() else null, .table_extra_bytes = table.extra.len });
    }
    return rows.toOwnedSlice(a);
}
test "HWP5 table layout source actual placement and policy allocation failures" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const expected = try read(a, raw, source.header.version());
    defer a.free(expected);
    try std.testing.expect(expected.len > 0);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: []const u8, version: @import("../version.zig").Version, values: []const Source) !void {
            const result = try read(allocator, input, version);
            defer allocator.free(result);
            try std.testing.expectEqualDeep(values, result);
        }
    }.run, .{ raw, source.header.version(), expected });
}
