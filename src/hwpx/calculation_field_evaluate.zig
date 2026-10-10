//! Numeric formula evaluation from current editor cells, never cached results.
const std = @import("std");
const editor = @import("editor_session.zig");
const bindings_mod = @import("table_display_bindings.zig");
const references = @import("calculation_cell_reference.zig");

pub fn evaluate(a: std.mem.Allocator, session: *const editor.Session, section_index: usize, begin: usize, formula: []const u8, max_cells: usize) !f64 {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    const tree = &section.tree;
    const uri = @import("document_xml.zig").paragraph_uri;
    if (begin >= tree.elements.len or !tree.elements[begin].is(uri, "fieldBegin")) return error.InvalidCalculationField;
    const raw_kind = (try tree.attributeValue(a, begin, "", "type")) orelse return error.InvalidCalculationField;
    const kind = try raw_kind.toUtf8(a, 4096);
    defer a.free(kind);
    if (!std.mem.eql(u8, kind, "FORMULA")) return error.InvalidCalculationField;
    const ctrl = tree.elements[begin].parent orelse return error.InvalidCalculationField;
    const run = tree.elements[ctrl].parent orelse return error.InvalidCalculationField;
    const paragraph = tree.elements[run].parent orelse return error.InvalidCalculationField;
    if (!tree.elements[ctrl].is(uri, "ctrl") or !tree.elements[run].is(uri, "run") or !tree.elements[paragraph].is(uri, "p")) return error.InvalidCalculationField;
    const owner = (try @import("table_display_owner.zig").resolve(a, tree, paragraph)) orelse return error.MissingCalculationTable;
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    const bindings = try bindings_mod.fromParagraphs(a, section, current.paragraphs);
    defer a.free(bindings);
    const Context = struct {
        a: std.mem.Allocator,
        session: *const editor.Session,
        section: usize,
        table: usize,
        paragraphs: []const @import("paragraph_structure_values.zig").Paragraph,
        bindings: []const bindings_mod.Binding,
        fn read(raw: *anyopaque, cell: references.Cell) anyerror!f64 {
            const self: *@This() = @ptrCast(@alignCast(raw));
            var found: ?usize = null;
            for (self.bindings) |binding| {
                if (binding.owner.table_node != self.table or binding.owner.cell.row != cell.row or binding.owner.cell.column != cell.column) continue;
                if (binding.owner.cell.row_span != 1 or binding.owner.cell.column_span != 1) return error.UnsupportedCalculationMergedCell;
                if (found != null) return error.UnsupportedCalculationCellParagraphs;
                found = binding.paragraph;
            }
            const ordinal = found orelse return error.MissingCalculationCell;
            if (!try self.session.canEdit(self.section, ordinal)) return error.UnsupportedCalculationCellContent;
            const selected = &self.session.sections[self.section];
            const value = self.paragraphs[ordinal - selected.first_paragraph];
            var text: std.ArrayList(u8) = .empty;
            defer text.deinit(self.a);
            for (value.sites.items) |site| {
                if (site.text.len > 1024 -| text.items.len) return error.LimitExceeded;
                try text.appendSlice(self.a, site.text);
            }
            return @import("calculation_numeric_text.zig").parse(text.items);
        }
    };
    var context = Context{ .a = a, .session = session, .section = section_index, .table = owner.table_node, .paragraphs = current.paragraphs, .bindings = bindings };
    return @import("calculation_range_evaluate.zig").evaluate(try @import("calculation_range_expression.zig").parse(formula), .{ .row = owner.cell.row.?, .column = owner.cell.column.? }, owner.rows, owner.columns, max_cells, .{ .context = &context, .read = Context.read });
}

test "HWPX calculation field evaluator reads every actual result from current cells" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const trees = [_]@import("xml_part_tree.zig").Tree{session.sections[0].tree};
    var snapshot = try @import("formula_field_snapshot.zig").read(a, &trees, 0);
    defer snapshot.deinit(a);
    try std.testing.expectEqual(@as(usize, 13), snapshot.rows.len);
    for (snapshot.rows) |row| {
        const format = try @import("calculation_result_format.zig").parse(row.raw[3].?);
        try std.testing.expect(format.grouping);
        if (format.kind == .fixed) try std.testing.expectEqual(@as(?u8, 2), format.precision);
        const result = try evaluate(a, &session, 0, row.begin_node, row.raw[2].?, 1000);
        const rendered = try @import("calculation_result_text.zig").render(a, result, format);
        defer a.free(rendered);
        try std.testing.expectEqualStrings(row.raw[4].?, rendered);
        try std.testing.expectApproxEqAbs(try @import("calculation_numeric_text.zig").parse(row.raw[4].?), result, 1e-8);
    }
    const before = try session.save();
    defer a.free(before);
    try std.testing.expectEqualSlices(u8, bytes, before);
    const first = snapshot.rows[0];
    const tree = &session.sections[0].tree;
    const ctrl = tree.elements[first.begin_node].parent.?;
    const run = tree.elements[ctrl].parent.?;
    const template = tree.elements[run].parent.?;
    const owner = (try @import("table_display_owner.zig").resolve(a, tree, template)).?;
    const bindings = try bindings_mod.read(a, &session, 0);
    defer a.free(bindings);
    var target: ?usize = null;
    for (bindings) |binding| {
        if (binding.owner.table_node == owner.table_node and binding.owner.cell.row == 1 and binding.owner.cell.column == 1) target = binding.paragraph;
    }
    try std.testing.expect(try session.splice(0, target.?, 0, 4, "12.2"));
    try std.testing.expectApproxEqAbs(@as(f64, 68.5), try evaluate(a, &session, 0, first.begin_node, first.raw[2].?, 4), 1e-12);
    try std.testing.expectEqualStrings("67.5", first.raw[4].?);
    try std.testing.expectError(error.LimitExceeded, evaluate(a, &session, 0, first.begin_node, first.raw[2].?, 3));
    try std.testing.expectError(error.InvalidSectionIndex, evaluate(a, &session, 999, first.begin_node, first.raw[2].?, 4));
}
