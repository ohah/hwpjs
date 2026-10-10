//! Resolve a current paragraph's immutable template to its direct cell owner.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const Cell = @import("table_display_cell.zig").Cell;

pub const Owner = struct { table_node: usize, cell_node: usize, list_node: usize, rows: u32, columns: u32, cell: Cell };

pub fn resolve(a: std.mem.Allocator, tree: *const Tree, template: usize) !?Owner {
    if (template >= tree.elements.len or !fields.childIs(tree, template, "p")) return error.InvalidCellParagraphTemplate;
    const list = tree.elements[template].parent orelse return null;
    if (!fields.childIs(tree, list, "subList")) return null;
    const cell_node = tree.elements[list].parent orelse return null;
    if (!fields.childIs(tree, cell_node, "tc")) return null;
    const row = tree.elements[cell_node].parent orelse return error.InvalidCellDisplayOwner;
    if (!fields.childIs(tree, row, "tr")) return error.InvalidCellDisplayOwner;
    const table = tree.elements[row].parent orelse return error.InvalidCellDisplayOwner;
    if (!fields.childIs(tree, table, "tbl")) return error.InvalidCellDisplayOwner;
    const cell = try @import("table_display_cell.zig").read(a, tree, cell_node);
    if (cell.sub_list != list) return error.InvalidCellDisplayOwner;
    const dimensions = try fields.optionalUnsignedPair(a, tree, table, .{ "rowCnt", "colCnt" }, 4096);
    const rows = dimensions[0] orelse return error.MissingTableDisplayDimensions;
    const columns = dimensions[1] orelse return error.MissingTableDisplayDimensions;
    const r = cell.row orelse return error.MissingCellDisplayCoordinates;
    const c = cell.column orelse return error.MissingCellDisplayCoordinates;
    const rs = cell.row_span orelse return error.MissingCellDisplaySpan;
    const cs = cell.column_span orelse return error.MissingCellDisplaySpan;
    if (r >= rows or c >= columns or rs == 0 or cs == 0 or rs > rows - r or cs > columns - c) return error.InvalidCellDisplaySpan;
    return .{ .table_node = table, .cell_node = cell_node, .list_node = list, .rows = rows, .columns = columns, .cell = cell };
}

test "HWPX display owner resolves actual cell templates after split without changing text authority" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const section = &session.sections[0];
    var target: ?usize = null;
    var expected: ?Owner = null;
    for (section.locations) |location| {
        const template = try @import("paragraph_site_owner.zig").resolve(&section.tree, &section.sites, section.locations, location.paragraph_ordinal);
        if (try resolve(a, &section.tree, template)) |owner| {
            target = location.paragraph_ordinal;
            expected = owner;
            break;
        }
    }
    const paragraph = target orelse return error.MissingCellDisplayOwner;
    try std.testing.expect(try session.splitParagraph(0, paragraph, 0, 0));
    const values = section.structure_values orelse return error.MissingCurrentParagraphs;
    const local = paragraph - section.first_paragraph;
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, tree: *const Tree, template: usize, before: Owner) !void {
            const owner = (try resolve(allocator, tree, template)).?;
            try std.testing.expectEqualDeep(before, owner);
        }
    };
    for (values.paragraphs[local .. local + 2]) |current| {
        try Probe.run(a, &section.tree, current.template_element, expected.?);
        try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &section.tree, current.template_element, expected.? });
    }
    try std.testing.expectError(error.InvalidCellParagraphTemplate, resolve(a, &section.tree, section.tree.elements.len));
}
