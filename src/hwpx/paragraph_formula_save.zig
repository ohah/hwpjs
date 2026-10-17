//! Formula derivation on transient composed topology, never on overlapping old spans.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
pub fn write(a: std.mem.Allocator, trees: []const Tree, section: usize, composed: []const u8, options: @import("text_sites.zig").Options, limit: usize) ![]u8 {
    return writeWithDefinitions(a, trees, section, composed, options, null, limit);
}

pub fn writeWithDefinitions(a: std.mem.Allocator, trees: []const Tree, section: usize, composed: []const u8, options: @import("text_sites.zig").Options, definitions: ?*const @import("formula_definition_values.zig").Values, limit: usize) ![]u8 {
    if (section >= trees.len) return error.InvalidSectionIndex;
    var rendered = try @import("xml_part_tree.zig").parse(a, composed, .section, section, trees[section].item_index, .{ .max_xml_bytes = limit });
    defer rendered.deinit(a);
    const views = try a.dupe(Tree, trees);
    defer a.free(views);
    views[section] = rendered;
    var sites = try @import("text_sites.zig").collect(a, &rendered, options);
    defer sites.deinit(a);
    var rebound = if (definitions) |values| try @import("formula_definition_rebind.zig").rebind(a, &trees[section], &rendered, values) else @import("formula_definition_values.zig").Values{};
    defer rebound.deinit(a);
    const output = try @import("formula_section_save.zig").writeWithDefinitions(a, views, section, &sites, options, &.{}, &rebound, limit);
    errdefer a.free(output);
    var verified_tree = try @import("xml_part_tree.zig").parse(a, output, .section, section, trees[section].item_index, .{ .max_xml_bytes = limit });
    defer verified_tree.deinit(a);
    views[section] = verified_tree;
    var verified_sites = try @import("text_sites.zig").collect(a, &verified_tree, options);
    defer verified_sites.deinit(a);
    const pending = try @import("formula_section_prepare.zig").prepare(a, views, section, &verified_sites, .{ .branch_policy = options.branch_policy });
    defer {
        for (pending) |*field| field.deinit(a);
        a.free(pending);
    }
    if (pending.len != 0) return error.StructuralFormulaOutputMismatch;
    return output;
}

test "HWPX composed formula save derives current cells and cleans every allocation failure" {
    const a = std.testing.allocator;
    const source = @import("test_formula_fixture.zig").section;
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    const trees = [_]Tree{tree};
    const target = "<p:t>2</p:t>";
    const offset = std.mem.indexOf(u8, source, target).?;
    const composed = try std.mem.concat(a, u8, &.{ source[0..offset], "<p:t>100</p:t>", source[offset + target.len ..] });
    defer a.free(composed);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, views: []const Tree, input: []const u8) !void {
            const output = try write(allocator, views, 0, input, .{}, 10000);
            defer allocator.free(output);
            try std.testing.expectEqual(@as(usize, 2), std.mem.count(u8, output, "<p:t>100</p:t>"));
            try std.testing.expect(std.mem.indexOf(u8, output, "name='LastResult'>100") != null);
            try std.testing.expect(std.mem.indexOf(u8, output, ",;;100</p:stringParam>") != null);
            try std.testing.expect(std.mem.indexOf(u8, output, "dirty=\"1\"") != null);
        }
        fn rejectTextProduct(allocator: std.mem.Allocator, views: []const Tree, input: []const u8) !void {
            if (write(allocator, views, 0, input, .{}, 10000)) |unexpected| {
                allocator.free(unexpected);
                return error.ExpectedFormulaNumberRejection;
            } else |err| {
                if (err == error.OutOfMemory) return err;
                try std.testing.expectEqual(error.InvalidFormulaNumber, err);
            }
        }
    };
    try Probe.run(a, &trees, composed);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &trees, composed });
    try std.testing.expectEqualSlices(u8, source, tree.source);
    const invalid = try std.mem.concat(a, u8, &.{ source[0..offset], "<p:t>bad</p:t>", source[offset + target.len ..] });
    defer a.free(invalid);
    // SUM/AVG share scalar classification; PRODUCT keeps strict numeric reads.
    const text_sum = try write(a, &trees, 0, invalid, .{}, 10000);
    defer a.free(text_sum);
    try std.testing.expect(std.mem.indexOf(u8, text_sum, "<p:t>bad</p:t>") != null);
    try std.testing.expect(std.mem.indexOf(u8, text_sum, "name='LastResult'>0") != null);
    try std.testing.expect(std.mem.indexOf(u8, text_sum, ",;;0</p:stringParam>") != null);
    const average_input = try std.mem.replaceOwned(u8, a, invalid, "SUM(", "AVG(");
    defer a.free(average_input);
    const average_output = try write(a, &trees, 0, average_input, .{}, 10000);
    defer a.free(average_output);
    try std.testing.expect(std.mem.indexOf(u8, average_output, "<p:t>bad</p:t>") != null);
    try std.testing.expect(std.mem.indexOf(u8, average_output, "name='LastResult'>0") != null);
    try std.testing.expect(std.mem.indexOf(u8, average_output, "=AVG(A1:A1)??%g,;;0") != null);
    // Negative control: an unexpected owned success is freed before rejection.
    try std.testing.expectError(error.ExpectedFormulaNumberRejection, Probe.rejectTextProduct(a, &trees, average_input));
    const strict_input = try std.mem.replaceOwned(u8, a, invalid, "SUM(", "PRODUCT(");
    defer a.free(strict_input);
    try Probe.rejectTextProduct(a, &trees, strict_input);
    try @import("../testing/allocation_failures.zig").check(Probe.rejectTextProduct, .{ &trees, strict_input });
    try std.testing.expectError(error.InvalidSectionIndex, write(a, &trees, 1, composed, .{}, 10000));
    try std.testing.expectError(error.LimitExceeded, write(a, &trees, 0, composed, .{}, 1));
}
