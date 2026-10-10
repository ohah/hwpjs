//! Source list flags and insets; current cell dimensions remain elsewhere.
const std = @import("std");
pub const Source = struct {
    table_record_node: usize,
    list_node: usize,
    attributes: u32,
    unknown: ?u16,
    text_direction: u3,
    line_wrap: u2,
    vertical_alignment: u2,
    has_margin: bool,
    protected: bool,
    header: bool,
    editable: bool,
    margins: [4]i16,
    border_fill_id: u16,
    extra_bytes: usize,
};
pub fn read(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version) ![]Source {
    var tree = try @import("../body/tree.zig").Tree.parse(a, raw, version, .{});
    defer tree.deinit(a);
    var out: std.ArrayList(Source) = .empty;
    errdefer out.deinit(a);
    for (tree.nodes, 0..) |node, index| {
        if (node.record.value != .control_header or node.record.value.control_header.id != @import("../body/control_rules.zig").table_id) continue;
        var lists = try @import("../body/table_lists.zig").Iterator.init(tree, index);
        while (lists.next()) |entry| {
            if (entry.kind != .cell) continue;
            const view = try tree.nodes[entry.node].record.value.list_header.view(.observed8);
            const cell = try @import("../body/table_cell.zig").Cell.parse(view.extra);
            const attrs = @import("../body/cell_attributes.zig").Attributes.fromList(view);
            try out.append(a, .{ .table_record_node = lists.table_node, .list_node = entry.node, .attributes = attrs.raw, .unknown = view.unknown, .text_direction = view.direction(), .line_wrap = view.wrapping(), .vertical_alignment = view.alignment(), .has_margin = attrs.hasInnerMargins(), .protected = attrs.isProtected(), .header = attrs.isHeader(), .editable = attrs.isEditable(), .margins = cell.margins, .border_fill_id = cell.border_fill_id, .extra_bytes = cell.extra.len });
        }
    }
    return out.toOwnedSlice(a);
}
test "HWP5 cell layout sources actual attributes insets and allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    const expected = try read(a, bytes, source.header.version());
    defer a.free(expected);
    try std.testing.expect(expected.len > 0);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, rows: []const Source) !void {
            const values = try read(allocator, raw, version);
            defer allocator.free(values);
            try std.testing.expectEqualDeep(rows, values);
        }
    }.run, .{ bytes, source.header.version(), expected });
}
