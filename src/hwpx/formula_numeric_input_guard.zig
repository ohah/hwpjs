//! Supplementary transaction guard; never grants edit permission.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Sites = @import("text_sites.zig").Sites;

pub fn validateFormulaTransition(a: std.mem.Allocator, trees: []const Tree, section: usize, before: *const Sites, after: *const Sites, definitions: ?*const @import("formula_definition_values.zig").Values) !void {
    if (section >= trees.len) return error.InvalidSectionIndex;
    var inputs: std.ArrayList(usize) = .empty;
    defer inputs.deinit(a);
    const prior = try @import("formula_section_prepare.zig").prepare(a, trees, section, before, .{ .definitions = definitions, .numeric_inputs = &inputs });
    defer {
        for (prior) |*field| field.deinit(a);
        a.free(prior);
    }
    try validate(a, &trees[section], before, after, inputs.items);
}

pub fn validate(a: std.mem.Allocator, tree: *const Tree, before: *const Sites, after: *const Sites, input_cells: []const usize) !void {
    if (before.items.len != after.items.len) return error.SourceBindingMismatch;
    const frames = try @import("xml_tree_selection.zig").build(a, tree, .{ .mode = .selected }, 4096);
    defer a.free(frames);
    const limits: @import("formula_values.zig").Limits = .{};
    var remaining = limits.inspections;
    for (before.items, after.items) |old, now| {
        if (old.element_index != now.element_index) return error.SourceBindingMismatch;
        if (old.element_index >= tree.elements.len) return error.InvalidTextSites;
        if (!frames[old.element_index].active or std.mem.eql(u8, old.text, now.text)) continue;
        var cursor: ?usize = old.element_index;
        const cell = while (cursor) |node| : (cursor = tree.elements[node].parent) {
            if (@import("table_xml_fields.zig").childIs(tree, node, "tc")) break node;
        } else continue;
        if (std.mem.indexOfScalar(usize, input_cells, cell) == null) continue;
        const cost = std.math.add(usize, tree.elements.len, before.items.len) catch return error.LimitExceeded;
        if (cost > remaining / 2) return error.LimitExceeded;
        remaining -= cost * 2;
        // Non-numeric and control-bearing cells still require the caller's
        // ordinary structure, permission and formula preparation checks.
        const prior = @import("formula_cell_number.zig").classifySelected(a, tree, before, cell, frames) catch |err| switch (err) {
            error.InvalidFormulaNumber, error.UnsupportedFormulaCellContent, error.UnsupportedFormulaCellParagraphs => continue,
            else => return err,
        };
        if (prior != .number) continue;
        const next = try @import("formula_cell_number.zig").classifySelected(a, tree, after, cell, frames);
        if (next != .number) return error.InvalidFormulaNumber;
    }
}

test "HWPX numeric input guard rejects invalid transitions before formula aggregation" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, @import("test_formula_fixture.zig").section, .section, 0, 0, .{});
    defer tree.deinit(a);
    var before = try @import("text_sites.zig").collect(a, &tree, .{});
    defer before.deinit(a);
    var after = try before.clone(a);
    defer after.deinit(a);
    const input_cell = for (tree.elements, 0..) |_, node| {
        if (@import("table_xml_fields.zig").childIs(&tree, node, "tc")) break node;
    } else return error.TestExpectedEqual;
    const inputs = [_]usize{input_cell};
    const replacement = try a.dupe(u8, "bad");
    a.free(after.items[0].text);
    after.items[0].text = replacement;
    try std.testing.expectError(error.InvalidFormulaNumber, validate(a, &tree, &before, &after, &inputs));
    try validate(a, &tree, &before, &after, &.{});
    try std.testing.expectEqualStrings("2", before.items[0].text);
    const numeric = try a.dupe(u8, "100");
    a.free(after.items[0].text);
    after.items[0].text = numeric;
    try validate(a, &tree, &before, &after, &inputs);
    try @import("../testing/allocation_failures.zig").check(validate, .{ &tree, &before, &after, @as([]const usize, &inputs) });
    after.items[0].element_index = tree.elements.len;
    try std.testing.expectError(error.SourceBindingMismatch, validate(a, &tree, &before, &after, &inputs));
}

fn collectionCase(a: std.mem.Allocator) !void {
    const owner = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(owner, @import("test_formula_fixture.zig").section, .section, 0, 0, .{});
    defer tree.deinit(owner);
    var sites = try @import("text_sites.zig").collect(owner, &tree, .{});
    defer sites.deinit(owner);
    var inputs: std.ArrayList(usize) = .empty;
    defer inputs.deinit(a);
    const prepared = try @import("formula_section_prepare.zig").prepare(a, &.{tree}, 0, &sites, .{ .numeric_inputs = &inputs });
    defer {
        for (prepared) |*field| field.deinit(a);
        a.free(prepared);
    }
    try std.testing.expectEqual(@as(usize, 1), inputs.items.len);
    const input = for (tree.elements, 0..) |_, node| {
        if (@import("table_xml_fields.zig").childIs(&tree, node, "tc")) break node;
    } else return error.TestExpectedEqual;
    try std.testing.expectEqual(input, inputs.items[0]);
    try std.testing.expectEqualStrings("2", sites.items[0].text);
    try std.testing.expectEqualStrings(@import("test_formula_fixture.zig").section, tree.source);
}

test "HWPX numeric input guard collects evaluator inputs without result cells under OOM" {
    try collectionCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(collectionCase, .{});
}

test "HWPX numeric input guard protects first numeric paragraph but not its explanation" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:tbl><p:tr><p:tc><p:subList><p:p><p:run><p:t>12</p:t></p:run></p:p><p:p><p:run><p:t>(30.0)</p:t></p:run></p:p></p:subList></p:tc></p:tr></p:tbl></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var before = try @import("text_sites.zig").collect(a, &tree, .{});
    defer before.deinit(a);
    var after = try before.clone(a);
    defer after.deinit(a);
    const inputs = [_]usize{3};
    const note = try a.dupe(u8, "새 설명");
    a.free(after.items[1].text);
    after.items[1].text = note;
    try validate(a, &tree, &before, &after, &inputs);
    try @import("../testing/allocation_failures.zig").check(validate, .{ &tree, &before, &after, @as([]const usize, &inputs) });
    const invalid = try a.dupe(u8, "bad");
    a.free(after.items[0].text);
    after.items[0].text = invalid;
    try std.testing.expectError(error.InvalidFormulaNumber, validate(a, &tree, &before, &after, &inputs));
    try std.testing.expectEqualStrings("12", before.items[0].text);
    try std.testing.expectEqualStrings("(30.0)", before.items[1].text);
    try std.testing.expectEqualStrings(xml, tree.source);
}
