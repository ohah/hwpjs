//! Source-bound scalar parameter replacement preparation, not session state.
const std = @import("std");
const params = @import("parameter_lists.zig");
const writer = @import("xml_source_writer.zig");
pub const Prepared = struct {
    command: []u8,
    changes: [2]writer.Change,
    pub fn deinit(self: *Prepared, a: std.mem.Allocator) void {
        a.free(self.command);
        self.* = undefined;
    }
};

/// display borrows the caller until changes have been written.
pub fn prepare(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, report: *const params.Report, begin: usize, display: []const u8) !Prepared {
    const section = tree.section_ordinal orelse return error.SourceBindingMismatch;
    const view = (try @import("formula_parameters.zig").read(report, section, begin)) orelse return error.MissingFormulaParameters;
    _ = try @import("formula_expression.zig").parse(a, view);
    if (display.len > 4096 or !std.unicode.utf8ValidateSlice(display)) return error.InvalidFormulaResult;
    const wire = try std.unicode.utf8ToUtf16LeAlloc(a, view.command.?);
    defer a.free(wire);
    const envelope = try @import("../hwp5/body/formula_command.zig").View.parse(std.mem.sliceAsBytes(wire));
    const cached = try std.unicode.utf16LeToUtf8Alloc(a, wire[(wire.len - envelope.cached_display.len / 2)..]);
    defer a.free(cached);
    if (!std.mem.endsWith(u8, view.command.?, cached)) return error.SourceBindingMismatch;
    const command = try std.mem.concat(a, u8, &.{ view.command.?[0 .. view.command.?.len - cached.len], display });
    errdefer a.free(command);
    var changes = [_]writer.Change{
        try parameterChange(tree, report, begin, "Command", command),
        try parameterChange(tree, report, begin, "LastResult", display),
    };
    if (changes[0].start > changes[1].start) std.mem.swap(writer.Change, &changes[0], &changes[1]);
    return .{ .command = command, .changes = changes };
}

/// The replacement text is borrowed until the XML writer consumes the change.
pub fn parameterChange(tree: *const @import("xml_part_tree.zig").Tree, report: *const params.Report, begin: usize, parameter: []const u8, text: []const u8) !writer.Change {
    const section = tree.section_ordinal orelse return error.SourceBindingMismatch;
    var change: ?writer.Change = null;
    for (report.roots) |root| {
        if (root.section_ordinal != section or root.parent_element_index != begin) continue;
        if (root.first_node > report.nodes.len or root.node_count > report.nodes.len - root.first_node) return error.InvalidFormulaParameters;
        if (root.element_index >= tree.elements.len or !std.mem.eql(u8, root.raw_xml, tree.sourceOf(root.element_index))) return error.SourceBindingMismatch;
        for (report.nodes[root.first_node..][0..root.node_count]) |node| {
            if (node.parent_node_index != root.first_node) continue;
            const name = node.name orelse continue;
            if (!std.mem.eql(u8, name, parameter)) continue;
            if (node.kind != .string or node.value == null or node.direct_children != 0 or node.unknown_children != 0) return error.InvalidFormulaParameterType;
            if (change != null) return error.DuplicateFormulaParameter;
            if (node.element_index >= tree.elements.len or !std.mem.eql(u8, node.raw_xml, tree.sourceOf(node.element_index))) return error.SourceBindingMismatch;
            const element = tree.elements[node.element_index];
            const end = element.end_tag orelse return error.UnsupportedFormulaParameterContent;
            const start = element.start_tag.end;
            if (std.mem.indexOfScalar(u8, tree.source[start..end.start], '<') != null) return error.UnsupportedFormulaParameterContent;
            change = .{ .start = start, .end = end.start, .text = text };
        }
    }
    return change orelse error.MissingFormulaResultParameter;
}

test "HWPX formula parameter changes preserve definitions and fail allocation without modifying source" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:fieldBegin type='FORMULA'><p:parameters><p:stringParam name='Command'>=SUM(A1:A2)??%g,;;old</p:stringParam><p:stringParam name='Formula'>=SUM(A1:A2)</p:stringParam><p:stringParam name='LastResult'>old</p:stringParam></p:parameters></p:fieldBegin></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    const trees = [_]@import("xml_part_tree.zig").Tree{tree};
    var report = try params.inspect(a, &trees, .{});
    defer report.deinit();
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, t: *@import("xml_part_tree.zig").Tree, r: *params.Report, s: *@import("text_sites.zig").Sites, original: []const u8) !void {
            defer std.testing.expectEqualStrings(original, t.source) catch @panic("source modified");
            var prepared = try prepare(allocator, t, r, 1, "42&x");
            defer prepared.deinit(allocator);
            const output = try @import("text_sites_save.zig").writeWithChanges(allocator, t, s, .{}, &.{.{ .element_index = 1, .dirty = true }}, &prepared.changes, t.source.len + 100);
            defer allocator.free(output);
            try std.testing.expect(std.mem.indexOf(u8, output, ",;;42&amp;x") != null);
            try std.testing.expect(std.mem.indexOf(u8, output, "name='Formula'>=SUM(A1:A2)") != null);
        }
    }.run, .{ &tree, &report, &sites, source });
    var prepared = try prepare(a, &tree, &report, 1, "42");
    defer prepared.deinit(a);
    const formula_change = try parameterChange(&tree, &report, 1, "Formula", "=AVG(A1:A2)");
    const formula_output = try @import("text_sites_save.zig").writeWithChanges(a, &tree, &sites, .{}, &.{}, &.{formula_change}, tree.source.len + 100);
    defer a.free(formula_output);
    try std.testing.expect(std.mem.indexOf(u8, formula_output, "name='Formula'>=AVG(A1:A2)") != null);
    try std.testing.expect(std.mem.indexOf(u8, formula_output, "=SUM(A1:A2)??%g,;;old") != null);
    try std.testing.expectError(error.MissingFormulaResultParameter, parameterChange(&tree, &report, 1, "Absent", "x"));
    const duplicate = [_]writer.Change{ prepared.changes[0], prepared.changes[0] };
    try std.testing.expectError(error.InvalidSourceSpan, @import("text_sites_save.zig").writeWithChanges(a, &tree, &sites, .{}, &.{}, &duplicate, tree.source.len + 100));
    try std.testing.expectError(error.InvalidFormulaResult, prepare(a, &tree, &report, 1, &.{0xff}));
}

test "HWPX formula parameter change rejects forged report spans" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, @import("test_formula_fixture.zig").section, .section, 0, 0, .{});
    defer tree.deinit(a);
    var report = try params.inspect(a, &.{tree}, .{});
    defer report.deinit();
    const roots = @constCast(report.roots);
    const root = roots[0];
    defer roots[0] = root;
    roots[0].first_node = report.nodes.len + 1;
    try std.testing.expectError(error.InvalidFormulaParameters, parameterChange(&tree, &report, root.parent_element_index, "Formula", "=AVG(A1:A1)"));
    roots[0] = root;
    roots[0].node_count = std.math.maxInt(usize);
    try std.testing.expectError(error.InvalidFormulaParameters, parameterChange(&tree, &report, root.parent_element_index, "Formula", "=AVG(A1:A1)"));
    roots[0] = root;
    const nodes = @constCast(report.nodes);
    for (nodes) |*node| {
        if (node.name == null or !std.mem.eql(u8, node.name.?, "Formula")) continue;
        const original = node.*;
        defer node.* = original;
        node.kind = .integer;
        try std.testing.expectError(error.InvalidFormulaParameterType, parameterChange(&tree, &report, root.parent_element_index, "Formula", "=AVG(A1:A1)"));
    }
}
