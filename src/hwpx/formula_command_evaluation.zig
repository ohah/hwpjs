//! Evaluate replacement commands from current Sites before producing owned values.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Sites = @import("text_sites.zig").Sites;
const plan = @import("formula_command_plan.zig");

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, begin: usize, replacement: []const u8, limits: @import("formula_values.zig").Limits) !plan.Plan {
    var source = try @import("formula_source_query.zig").read(a, tree, begin);
    defer source.deinit();
    var candidate = try plan.prepare(a, source.values, replacement, 0);
    defer candidate.deinit(a);
    const evaluated = try @import("formula_values.zig").evaluate(a, tree, sites, begin, candidate.parsed.range, limits);
    return plan.prepare(a, source.values, replacement, evaluated.value);
}

fn allocationCase(a: std.mem.Allocator) !void {
    var tree = try @import("xml_part_tree.zig").parse(a, @import("test_formula_fixture.zig").section, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    for (tree.elements, 0..) |element, node| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) continue;
        var result = try prepare(a, &tree, &sites, node, "=AVG(A1:A1)", .{});
        defer result.deinit(a);
        try std.testing.expectEqualStrings("2", result.display);
        var unexpected = prepare(a, &tree, &sites, node, "=AVG(A1:A1)", .{ .cells = 0 }) catch |err| {
            if (err == error.OutOfMemory) return err;
            try std.testing.expectEqual(error.LimitExceeded, err);
            return;
        };
        unexpected.deinit(a);
        return error.InvalidBudgetAccepted;
    }
    return error.MissingFormulaFieldNode;
}

test "HWPX replacement formula evaluates allocation failures and limits" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}

test "HWPX replacement formula evaluates actual SUM to AVG without mutating source" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const section = &session.sections[0];
    for (section.tree.elements, 0..) |element, node| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) continue;
        var result = try prepare(a, &section.tree, &section.sites, node, "=AVG(B?:E?)", .{});
        defer result.deinit(a);
        try std.testing.expectEqualStrings("16.875", result.display);
        try std.testing.expectEqualStrings("=AVG(B?:E?)??%g,;;16.875", result.command);
        const saved = try session.save();
        defer a.free(saved);
        try std.testing.expectEqualSlices(u8, bytes, saved);
        try std.testing.expectError(error.FormulaReferenceOutOfBounds, prepare(a, &section.tree, &section.sites, node, "=SUM(A1:ZZ999)", .{}));
        return;
    }
    return error.MissingFormulaFieldNode;
}
