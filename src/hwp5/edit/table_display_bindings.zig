//! Read-only current paragraph -> immutable source cell binding, not layout.
const std = @import("std");
const body = @import("../body/reader.zig");
const model = @import("../../model/document.zig");
pub const Binding = struct {
    paragraph: u32,
    table_node: u32,
    list_node: u32,
    rows: u32,
    columns: u32,
    row: u16,
    column: u16,
    row_span: u16,
    column_span: u16,
    width: u32,
    height: u32,
};
pub fn read(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, paragraphs: []const model.Paragraph) ![]Binding {
    if (paragraphs.len > 100_000) return error.LimitExceeded;
    var tree = try @import("../body/tree.zig").Tree.parse(a, source, version, .{});
    defer tree.deinit(a);
    var groups = try @import("../body/list_groups.zig").Groups.build(a, tree);
    defer groups.deinit(a);
    var output: std.ArrayList(Binding) = .empty;
    errdefer output.deinit(a);
    for (paragraphs, 0..) |p, index| {
        if (p.source_node != null and p.header_template != null) return error.SourceBindingMismatch;
        const node = p.source_node orelse p.header_template orelse return error.MissingParagraphSource;
        if (node >= tree.nodes.len or tree.nodes[node].record.value != .header) return error.SourceBindingMismatch;
        const parent = tree.nodes[node].parent;
        const expected: ?usize = if (p.parent_node) |value| value else null;
        if (parent != expected) return error.SourceBindingMismatch;
        const owner_node = parent orelse continue;
        const owner_value = tree.nodes[owner_node].record.value;
        if (owner_value != .control_header or owner_value.control_header.id != @import("../body/control_rules.zig").table_id) continue;
        const owner = @import("../body/formula_cell.zig").locate(tree, groups, node, .observed8) catch |err| {
            if (err == error.FormulaInCaption) continue;
            return err;
        };
        const cell = try body.Cell.parse((try tree.nodes[owner.list_node].record.value.list_header.view(.observed8)).extra);
        try output.append(a, .{ .paragraph = @intCast(index), .table_node = @intCast(owner.table_node), .list_node = @intCast(owner.list_node), .rows = owner.rows, .columns = owner.columns, .row = cell.row, .column = cell.column, .row_span = cell.row_span, .column_span = cell.column_span, .width = cell.width, .height = cell.height });
    }
    return output.toOwnedSlice(a);
}
fn allocationCase(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, paragraphs: []const model.Paragraph) !void {
    const bindings = try read(a, source, version, paragraphs);
    defer a.free(bindings);
    var found = false;
    for (bindings) |binding| if (binding.paragraph == 19) {
        try std.testing.expectEqual(@as(u16, 1), binding.row);
        try std.testing.expectEqual(@as(u16, 1), binding.column);
        try std.testing.expectEqual(@as(u16, 1), binding.row_span);
        try std.testing.expectEqual(@as(u16, 1), binding.column_span);
        try std.testing.expectEqual(@as(u32, 5), binding.rows);
        try std.testing.expectEqual(@as(u32, 6), binding.columns);
        found = true;
    };
    try std.testing.expect(found);
}
test "HWP5 table display binding shares cell ownership and survives every allocation failure" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwp", a, .limited(2_000_000));
    defer a.free(bytes);
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const section = try source.decodeSection(a, 0);
    defer a.free(section);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{section});
    defer document.deinit(a);
    try std.testing.checkAllAllocationFailures(a, allocationCase, .{ section, source.header.version(), document.sections[0].paragraphs });
    const original = document.sections[0].paragraphs[19];
    document.sections[0].paragraphs[19].parent_node = null;
    try std.testing.expectError(error.SourceBindingMismatch, read(a, section, source.header.version(), document.sections[0].paragraphs));
    document.sections[0].paragraphs[19] = original;
    document.sections[0].paragraphs[19].header_template = original.source_node;
    try std.testing.expectError(error.SourceBindingMismatch, read(a, section, source.header.version(), document.sections[0].paragraphs));
    document.sections[0].paragraphs[19].source_node = null;
    // Generated paragraphs use explicit template provenance, not forged IDs.
    try allocationCase(a, section, source.header.version(), document.sections[0].paragraphs);
    document.sections[0].paragraphs[19] = original;
}
