//! Recursive values from current inputs, with shared budgets and no result cache.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Sites = @import("text_sites.zig").Sites;
const scalar = @import("formula_values.zig");

pub fn evaluate(a: std.mem.Allocator, trees: []const Tree, section: usize, sites: *const Sites, begin: usize, definitions: ?*const @import("formula_definition_values.zig").Values, limits: scalar.Limits) !f64 {
    if (section >= trees.len or trees[section].section_ordinal != section) return error.InvalidSectionIndex;
    var markers = try @import("field_markers.zig").inspect(a, trees, .{});
    defer markers.deinit();
    const ranges = try @import("field_text_ranges.zig").build(a, trees, &markers);
    defer a.free(ranges);
    var parameters = try @import("parameter_lists.zig").inspect(a, trees, .{});
    defer parameters.deinit();
    const frames = try @import("xml_tree_selection.zig").build(a, &trees[section], .{ .mode = .selected }, 4096);
    defer a.free(frames);
    var context: Context = .{ .allocator = a, .tree = &trees[section], .sites = sites, .ranges = ranges, .markers = &markers, .parameters = &parameters, .definitions = definitions, .remaining = limits, .frames = frames };
    return context.value(begin);
}

/// All reports, tree, Sites and definitions are borrowed for this evaluation.
/// One context shares the work budget across every root and dependency.
pub const Context = struct {
    allocator: std.mem.Allocator,
    tree: *const Tree,
    sites: *const Sites,
    ranges: []const @import("field_text_ranges.zig").Range,
    markers: *const @import("field_markers.zig").Report,
    parameters: *const @import("parameter_lists.zig").Report,
    definitions: ?*const @import("formula_definition_values.zig").Values,
    remaining: scalar.Limits,
    frames: []const @import("xml_tree_selection.zig").Frame,
    stack: [64]usize = undefined,
    depth: usize = 0,

    pub fn value(self: *Context, begin: usize) anyerror!f64 {
        if (begin >= self.frames.len) return error.InvalidFormulaFieldNode;
        if (!self.frames[begin].active) return error.InvalidFormulaDefinitionSelection;
        for (self.stack[0..self.depth]) |ancestor| if (ancestor == begin) return error.FormulaDependencyCycle;
        if (self.depth >= self.stack.len) return error.LimitExceeded;
        if (!try @import("formula_source_query.zig").isFormula(self.allocator, self.tree, begin)) return error.InvalidFormulaFieldNode;
        self.stack[self.depth] = begin;
        self.depth += 1;
        defer self.depth -= 1;
        const view = (try @import("formula_parameters.zig").read(self.parameters, self.tree.section_ordinal.?, begin)) orelse return error.MissingFormulaParameters;
        const replacement = if (self.definitions) |definitions| definitions.get(begin) else null;
        var draft = if (replacement) |formula| try @import("formula_command_plan.zig").prepare(self.allocator, view, formula, 0) else null;
        defer if (draft) |*plan| plan.deinit(self.allocator);
        const expression = if (draft) |plan| plan.parsed else try @import("formula_expression.zig").parse(self.allocator, view);
        const result = try scalar.evaluateWith(self.allocator, self.tree, self.sites, begin, expression.range, self.remaining, Reader{ .context = self });
        return result.value;
    }
};

const Reader = struct {
    context: *Context,
    pub fn charge(self: Reader, cells: usize, inspections: usize) !void {
        const budget = &self.context.remaining;
        if (cells > budget.cells or inspections > budget.inspections) return error.LimitExceeded;
        budget.cells -= cells;
        budget.inspections -= inspections;
    }
    pub fn read(self: Reader, a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, cell: usize) anyerror!f64 {
        const begin = try @import("formula_dependency_cell.zig").markerSelected(tree, sites, cell, self.context.ranges, self.context.markers, self.context.frames);
        if (begin) |node| return self.context.value(node);
        return @import("formula_cell_number.zig").readSelected(a, tree, sites, cell, self.context.frames);
    }
};

test "HWPX dependency evaluator allocation failures preserve source and current inputs" {
    try @import("../testing/allocation_failures.zig").check(dependencyAllocationProbe, .{});
}

fn dependencyAllocationProbe(a: std.mem.Allocator) !void {
    // Fixture ownership is independent of the evaluator's failing allocator.
    const owner = std.testing.allocator;
    const fixture = @import("test_formula_fixture.zig").section;
    var tree = try @import("xml_part_tree.zig").parse(owner, fixture, .section, 0, 0, .{});
    defer tree.deinit(owner);
    var sites = try @import("text_sites.zig").collect(owner, &tree, .{});
    defer sites.deinit(owner);
    var begin: usize = 0;
    for (tree.elements, 0..) |element, node| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) begin = node;
    }
    var definitions: @import("formula_definition_values.zig").Values = .{};
    defer definitions.deinit(owner);
    _ = try definitions.set(owner, &tree, begin, "=AVG(A1:A1)");
    const trees = [_]Tree{tree};
    const result = evaluate(a, &trees, 0, &sites, begin, &definitions, .{}) catch |err| {
        try std.testing.expectEqualStrings("=AVG(A1:A1)", definitions.get(begin).?);
        try std.testing.expectEqualStrings(fixture, tree.source);
        return err;
    };
    try std.testing.expectEqual(@as(f64, 2), result);
    try std.testing.expectEqualStrings("=AVG(A1:A1)", definitions.get(begin).?);
    try std.testing.expectEqualStrings(fixture, tree.source);
}

test "HWPX dependency evaluator rejects self cycles and reads current inputs not caches" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, @import("test_formula_fixture.zig").section, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    var begin: usize = 0;
    for (tree.elements, 0..) |element, node| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) begin = node;
    }
    const trees = [_]Tree{tree};
    try std.testing.expectEqual(@as(f64, 2), try evaluate(a, &trees, 0, &sites, begin, null, .{}));
    var definitions: @import("formula_definition_values.zig").Values = .{};
    defer definitions.deinit(a);
    _ = try definitions.set(a, &tree, begin, "=SUM(B1:B1)");
    try std.testing.expectError(error.FormulaDependencyCycle, evaluate(a, &trees, 0, &sites, begin, &definitions, .{}));
    try std.testing.expectError(error.LimitExceeded, evaluate(a, &trees, 0, &sites, begin, null, .{ .cells = 0 }));
}

test "HWPX dependency evaluator refuses an inactive compatibility formula" {
    const a = std.testing.allocator;
    const fixture = @import("test_formula_fixture.zig").section;
    const start = std.mem.indexOf(u8, fixture, "<p:ctrl><p:fieldBegin").?;
    const end = std.mem.indexOfPos(u8, fixture, start, "</p:run>").?;
    const xml = try std.mem.concat(a, u8, &.{ fixture[0..start], "<p:switch><p:case>", fixture[start..end], "</p:case><p:default/></p:switch>", fixture[end..] });
    defer a.free(xml);
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    var begin: usize = 0;
    for (tree.elements, 0..) |element, node| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) begin = node;
    }
    try std.testing.expectError(error.InvalidFormulaDefinitionSelection, evaluate(a, &.{tree}, 0, &sites, begin, null, .{}));
}

test "HWPX dependency evaluator selects plain numeric input branches" {
    const a = std.testing.allocator;
    const fixture = @import("test_formula_fixture.zig").section;
    const start = std.mem.indexOf(u8, fixture, "<p:t>2</p:t>").?;
    const end = start + "<p:t>2</p:t>".len;
    const xml = try std.mem.concat(a, u8, &.{ fixture[0..start], "<p:switch><p:case><p:t>invalid number</p:t><p:ctrl/></p:case><p:default><p:t>2</p:t></p:default></p:switch>", fixture[end..] });
    defer a.free(xml);
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    var begin: usize = 0;
    for (tree.elements, 0..) |element, node| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) begin = node;
    }
    try std.testing.expectEqual(@as(f64, 2), try evaluate(a, &.{tree}, 0, &sites, begin, null, .{}));
}

test "HWPX dependency evaluator computes a chain and charges shared cell budget" {
    const a = std.testing.allocator;
    const fixture = @import("test_formula_fixture.zig").section;
    const first = std.mem.indexOf(u8, fixture, "<p:tc>").?;
    const second = std.mem.indexOfPos(u8, fixture, first + 1, "<p:tc>").?;
    const end = std.mem.indexOfPos(u8, fixture, second, "</p:tc>").? + "</p:tc>".len;
    var extra = try a.dupe(u8, fixture[second..end]);
    defer a.free(extra);
    const replacements = [_][2][]const u8{
        .{ "colAddr='1'", "colAddr='2'" },
        .{ "id='1'", "id='2'" },
        .{ "beginIDRef='1'", "beginIDRef='2'" },
        .{ "=SUM(A1:A1)", "=SUM(B1:B1)" },
    };
    for (replacements) |pair| {
        const updated = try std.mem.replaceOwned(u8, a, extra, pair[0], pair[1]);
        a.free(extra);
        extra = updated;
    }
    const expanded = try std.mem.concat(a, u8, &.{ fixture[0..end], extra, fixture[end..] });
    defer a.free(expanded);
    const xml = try std.mem.replaceOwned(u8, a, expanded, "colCnt='2'", "colCnt='3'");
    defer a.free(xml);
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const stale = try a.dupe(u8, "stale cache");
    a.free(sites.items[1].text);
    sites.items[1].text = stale;
    var begins: [2]usize = undefined;
    var count: usize = 0;
    for (tree.elements, 0..) |element, index| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) continue;
        begins[count] = index;
        count += 1;
    }
    const trees = [_]Tree{tree};
    try std.testing.expectEqual(@as(f64, 2), try evaluate(a, &trees, 0, &sites, begins[1], null, .{}));
    try std.testing.expectError(error.LimitExceeded, evaluate(a, &trees, 0, &sites, begins[1], null, .{ .cells = 1 }));
    var definitions: @import("formula_definition_values.zig").Values = .{};
    defer definitions.deinit(a);
    _ = try definitions.set(a, &tree, begins[0], "=SUM(C1:C1)");
    try std.testing.expectError(error.FormulaDependencyCycle, evaluate(a, &trees, 0, &sites, begins[1], &definitions, .{}));
}
