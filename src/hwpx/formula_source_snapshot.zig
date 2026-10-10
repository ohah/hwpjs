//! Source field list; row strings borrow the one owned parameter report.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const parameters = @import("parameter_lists.zig");
pub const Row = struct { begin_element: usize, values: @import("formula_parameters.zig").View };
pub const Snapshot = struct {
    report: parameters.Report,
    rows: []Row,
    pub fn deinit(self: *Snapshot, a: std.mem.Allocator) void {
        a.free(self.rows);
        self.report.deinit();
        self.* = undefined;
    }
};
pub fn read(a: std.mem.Allocator, tree: *const Tree) !Snapshot {
    const section = tree.section_ordinal orelse return error.InvalidFormulaSection;
    var report = try parameters.inspectSection(a, tree, .{});
    errdefer report.deinit();
    var rows: std.ArrayList(Row) = .empty;
    errdefer rows.deinit(a);
    for (tree.elements, 0..) |element, node| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) continue;
        if (!try @import("formula_source_query.zig").isFormula(a, tree, node)) continue;
        if (rows.items.len >= 4096) return error.LimitExceeded;
        const values = (try @import("formula_parameters.zig").read(&report, section, node)) orelse return error.MissingFormulaParameters;
        try rows.append(a, .{ .begin_element = node, .values = values });
    }
    return .{ .report = report, .rows = try rows.toOwnedSlice(a) };
}
