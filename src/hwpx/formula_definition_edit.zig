//! Atomic current-definition edit; validation uses the same save preparation.
const std = @import("std");

fn allocationCase(a: std.mem.Allocator) !void {
    const bytes = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "");
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    var node: usize = 0;
    for (session.sections[0].tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) node = index;
    }
    _ = session.setFormulaDefinition(0, node, "=AVG(A1:A1)") catch |err| {
        try std.testing.expect(session.sections[0].formula_definitions.get(node) == null);
        return err;
    };
    _ = session.setFormulaDefinition(0, node, "=SUM(A1:A1)") catch |err| {
        try std.testing.expectEqualStrings("=AVG(A1:A1)", session.sections[0].formula_definitions.get(node).?);
        return err;
    };
    try std.testing.expect(session.sections[0].formula_definitions.get(node) == null);
    try std.testing.expectEqualSlices(u8, bytes, session.source);
}

test "HWPX formula definition edit allocation failures keep current state atomic" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}

test "HWPX formula definition then paragraph split saves rebased identity and history" {
    const a = std.testing.allocator;
    const bytes = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p id='9'><p:run><p:t>AB</p:t></p:run></p:p>");
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    var node: usize = 0;
    for (session.sections[0].tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) node = index;
    }
    var history = try @import("editor_history.zig").History.init(&session, 8, 1_000_000);
    defer history.deinit();
    try std.testing.expect(try history.apply(&session, .{ .kind = .formula_definition, .paragraph = 0, .begin_element = node, .start = 0, .deleted = 0, .inserted = "=AVG(A1:A1)" }));
    const formula_zip = try session.save();
    defer a.free(formula_zip);
    try std.testing.expect(try history.apply(&session, .{ .kind = .split, .paragraph = 1, .start = 1, .deleted = 0, .inserted = "" }));
    const mixed = try session.save();
    defer a.free(mixed);
    var reopened = try @import("editor_session.zig").open(a, mixed, .{});
    defer reopened.deinit();
    var found = false;
    for (reopened.sections[0].tree.elements, 0..) |element, index| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) continue;
        try std.testing.expect(index != node);
        var query = try @import("formula_source_query.zig").read(a, &reopened.sections[0].tree, index);
        defer query.deinit();
        try std.testing.expectEqualStrings("=AVG(A1:A1)", query.values.formula.?);
        found = true;
    }
    try std.testing.expect(found);
    try std.testing.expect(try history.undo(&session));
    const unsplit = try session.save();
    defer a.free(unsplit);
    try std.testing.expectEqualSlices(u8, formula_zip, unsplit);
    try std.testing.expect(try history.undo(&session));
    const original = try session.save();
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, bytes, original);
    try std.testing.expect(try history.redo(&session));
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, mixed, redone);
    try std.testing.expect(try history.undo(&session));
    try std.testing.expect(try history.undo(&session));
    try std.testing.expect(try history.apply(&session, .{ .kind = .split, .paragraph = 1, .start = 1, .deleted = 0, .inserted = "" }));
    const split_only = try session.save();
    defer a.free(split_only);
    try std.testing.expect(try history.apply(&session, .{ .kind = .formula_definition, .paragraph = 0, .begin_element = node, .start = 0, .deleted = 0, .inserted = "=AVG(A1:A1)" }));
    const reverse = try session.save();
    defer a.free(reverse);
    try std.testing.expectEqualSlices(u8, mixed, reverse);
    try std.testing.expect(try history.undo(&session));
    const reverted = try session.save();
    defer a.free(reverted);
    try std.testing.expectEqualSlices(u8, split_only, reverted);
    try std.testing.expectError(error.FormulaReferenceOutOfBounds, history.apply(&session, .{ .kind = .formula_definition, .paragraph = 0, .begin_element = node, .start = 0, .deleted = 0, .inserted = "=SUM(A1:ZZ999)" }));
    try std.testing.expect(try history.redo(&session));
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, mixed, restored);
}
pub fn set(session: *@import("editor_session.zig").Session, section_index: usize, begin: usize, formula: []const u8) !bool {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    const a = session.allocator;
    const trees = try a.alloc(@import("xml_part_tree.zig").Tree, session.sections.len);
    defer a.free(trees);
    for (session.sections, trees) |value, *tree| tree.* = value.tree;
    var candidate = try section.formula_definitions.clone(a);
    defer candidate.deinit(a);
    const definition_changed = try candidate.set(a, &section.tree, begin, formula);
    var override_candidate = if (section.structure_values == null)
        try @import("formula_source_result_seed.zig").prepare(a, trees, section_index, &section.sites, &section.formula_definitions, &section.formula_result_overrides, @import("editor_session.zig").siteOptions(session.options))
    else
        try section.formula_result_overrides.clone(a);
    defer override_candidate.deinit(a);
    const override_removed = if (override_candidate.origin(begin) != null) try override_candidate.recalculate(a, &section.tree, begin) else false;
    if (!definition_changed and !override_removed) return false;
    if (section.structure_values != null or override_candidate.entries.items.len != 0) {
        const sections = try a.dupe(@import("editor_session.zig").Section, session.sections);
        defer a.free(sections);
        sections[section_index].formula_definitions = candidate;
        sections[section_index].formula_result_overrides = override_candidate;
        var proxy = session.*;
        proxy.sections = sections;
        const verified = try proxy.save();
        defer a.free(verified);
        std.mem.swap(@import("formula_definition_values.zig").Values, &candidate, &section.formula_definitions);
        std.mem.swap(@import("formula_result_override_values.zig").Values, &override_candidate, &section.formula_result_overrides);
        return true;
    }
    const prepared = try @import("formula_section_prepare.zig").prepare(a, trees, section_index, &section.sites, .{ .branch_policy = @import("editor_session.zig").siteOptions(session.options).branch_policy, .definitions = &candidate });
    defer {
        for (prepared) |*field| field.deinit(a);
        a.free(prepared);
    }
    std.mem.swap(@import("formula_definition_values.zig").Values, &candidate, &section.formula_definitions);
    return true;
}

test "HWPX formula definition command saves undo redo and preserves redo on rejection" {
    const a = std.testing.allocator;
    const bytes = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "");
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    var node: usize = 0;
    for (session.sections[0].tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) node = index;
    }
    var history = try @import("editor_history.zig").History.init(&session, 8, 1_000_000);
    defer history.deinit();
    const command: @import("editor_history.zig").Command = .{ .kind = .formula_definition, .paragraph = 0, .begin_element = node, .start = 0, .deleted = 0, .inserted = "=AVG(A1:A1)" };
    var bounded = try @import("editor_history.zig").History.init(&session, 2, try @import("editor_checkpoint.zig").size(&session, std.math.maxInt(usize)));
    defer bounded.deinit();
    try std.testing.expectError(error.LimitExceeded, bounded.apply(&session, command));
    try std.testing.expect(session.sections[0].formula_definitions.get(node) == null);
    try std.testing.expect(!try bounded.undo(&session));
    try std.testing.expect(try history.apply(&session, command));
    const changed = try session.save();
    defer a.free(changed);
    try std.testing.expect(try history.undo(&session));
    const original = try session.save();
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, bytes, original);
    var invalid = command;
    invalid.inserted = "=SUM(A1:ZZ999)";
    try std.testing.expectError(error.FormulaReferenceOutOfBounds, history.apply(&session, invalid));
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, changed, redone);
    try std.testing.expect(!try history.apply(&session, command));
}
