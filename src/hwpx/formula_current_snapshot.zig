//! Active current formula projection, not a persistent result cache.
const std = @import("std");
const source = @import("formula_source_snapshot.zig");
const output = @import("formula_field_output.zig");
pub const Row = struct {
    begin_element: usize,
    values: @import("formula_parameters.zig").View,
    owner: @import("formula_cell_owner.zig").Owner,
};
pub const Snapshot = struct {
    source: source.Snapshot,
    prepared: []output.Prepared,
    rows: []Row,
    pub fn deinit(self: *Snapshot, a: std.mem.Allocator) void {
        a.free(self.rows);
        for (self.prepared) |*field| field.deinit(a);
        a.free(self.prepared);
        self.source.deinit(a);
        self.* = undefined;
    }
};

pub fn read(a: std.mem.Allocator, session: *const @import("editor_session.zig").Session, section_index: usize) !Snapshot {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    if (section.structure_values != null) return @import("formula_structural_snapshot.zig").read(a, session, section_index);
    return readFlat(a, session, section_index);
}

/// Flat transient sessions must not enter structural serialization again.
pub fn readFlat(a: std.mem.Allocator, session: *const @import("editor_session.zig").Session, section_index: usize) !Snapshot {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    if (section.structure_values != null) return error.InvalidFlatFormulaSnapshot;
    var original = try source.read(a, &section.tree);
    errdefer original.deinit(a);
    const trees = try a.alloc(@import("xml_part_tree.zig").Tree, session.sections.len);
    defer a.free(trees);
    for (session.sections, trees) |value, *tree| tree.* = value.tree;
    const prepared = try @import("formula_section_prepare.zig").prepare(a, trees, section_index, &section.sites, .{ .only_changed = false, .branch_policy = @import("editor_session.zig").siteOptions(session.options).branch_policy, .definitions = &section.formula_definitions });
    errdefer {
        for (prepared) |*field| field.deinit(a);
        a.free(prepared);
    }
    const rows = try a.alloc(Row, prepared.len);
    errdefer a.free(rows);
    for (prepared, rows) |field, *row| {
        var found = false;
        for (original.rows) |entry| {
            if (entry.begin_element != field.begin) continue;
            row.* = .{ .begin_element = entry.begin_element, .values = entry.values, .owner = try @import("formula_cell_owner.zig").read(a, &section.tree, field.begin) };
            row.values.command = field.parameters.command;
            if (field.formula) |formula| row.values.formula = formula;
            row.values.last_result = field.display;
            found = true;
            break;
        }
        if (!found) return error.SourceBindingMismatch;
    }
    return .{ .source = original, .prepared = prepared, .rows = rows };
}

test "HWPX formula current snapshot allocation failure preserves live definitions" {
    const a = std.testing.allocator;
    const bytes = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "");
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    var node: usize = 0;
    for (session.sections[0].tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) node = index;
    }
    try std.testing.expect(try session.setFormulaDefinition(0, node, "=AVG(A1:A1)"));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, current: *const @import("editor_session.zig").Session, begin: usize) !void {
            defer std.testing.expectEqualStrings("=AVG(A1:A1)", current.sections[0].formula_definitions.get(begin).?) catch @panic("definition mutated");
            var snapshot = try read(allocator, current, 0);
            defer snapshot.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 1), snapshot.rows.len);
            try std.testing.expectEqualStrings("=AVG(A1:A1)", snapshot.rows[0].values.formula.?);
            try std.testing.expectEqualStrings("2", snapshot.rows[0].values.last_result.?);
        }
    }.run, .{ &session, node });
}
