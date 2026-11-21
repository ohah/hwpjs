const std = @import("std");
const plan = @import("original_cell_insets_plan.zig");
const ticket: @import("../model/history_mutation_epoch.zig").Ticket = .{ .binding = .{ .document = 1, .generation = 1, .owner = 1 }, .epoch = 1 };
const raw = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:tbl rowCnt='1' colCnt='1'><p:inMargin left='100' right='200' top='300' bottom='400'/><p:tr><p:tc hasMargin='0' protect='0' opaque='keep'><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/><p:cellSz width='10000' height='4000'/><p:cellMargin left='10' right='20' top='30' bottom='40'/><p:subList vertAlign='TOP'><p:p><p:run><p:t>keep text</p:t></p:run></p:p></p:subList></p:tc></p:tr></p:tbl></s:sec>";
fn template(tree: *const @import("xml_part_tree.zig").Tree) !usize {
    for (tree.elements, 0..) |element, node| if (element.is(@import("document_xml.zig").paragraph_uri, "p")) return node;
    return error.MissingOwnCellParagraph;
}
test "original cell insets HX inherited sparse materializes table defaults and explicit zero" {
    const a = std.testing.allocator;
    var tree = try @import("section_tree.zig").parse(a, raw, 0, 0, .{});
    defer tree.deinit(a);
    const before = try plan.observe(a, &tree, try template(&tree), ticket, false);
    const output = (try plan.write(a, &tree, .{ .before = before, .value = .{ .custom = .{ 0, null, null, null } } }, ticket, false, raw.len + 100)).?;
    defer a.free(output);
    var changed = try @import("section_tree.zig").parse(a, output, 0, 0, .{});
    defer changed.deinit(a);
    const after = try plan.observe(a, &changed, try template(&changed), ticket, false);
    try std.testing.expectEqualDeep([4]?i64{ 0, 200, 300, 400 }, after.source.cell);
    try std.testing.expect(after.source.use_cell.?);
    try std.testing.expect(std.mem.indexOf(u8, output, "opaque='keep'") != null);
    try std.testing.expectEqualStrings(raw, tree.source);
    const inherited = (try plan.write(a, &changed, .{ .before = after, .value = .inherit }, ticket, false, output.len)).?;
    defer a.free(inherited);
    const expected = try std.mem.replaceOwned(u8, a, output, "hasMargin='1'", "hasMargin='0'");
    defer a.free(expected);
    try std.testing.expectEqualSlices(u8, expected, inherited);
}
test "original cell insets HX no-op stale physical owner source and ticket remain closed" {
    const a = std.testing.allocator;
    var tree = try @import("section_tree.zig").parse(a, raw, 0, 0, .{});
    defer tree.deinit(a);
    const before = try plan.observe(a, &tree, try template(&tree), ticket, false);
    try std.testing.expect((try plan.write(a, &tree, .{ .before = before, .value = .inherit }, ticket, false, raw.len)) == null);
    var stale = before;
    stale.cell_node += 1;
    try std.testing.expectError(error.StaleOriginalCellInsets, plan.write(a, &tree, .{ .before = stale, .value = .inherit }, ticket, false, raw.len));
    stale = before;
    stale.source_sha256[0] ^= 1;
    try std.testing.expectError(error.StaleOriginalCellInsets, plan.write(a, &tree, .{ .before = stale, .value = .inherit }, ticket, false, raw.len));
    var foreign = ticket;
    foreign.epoch += 1;
    try std.testing.expectError(error.StaleOriginalCellInsets, plan.write(a, &tree, .{ .before = before, .value = .inherit }, foreign, false, raw.len));
    try std.testing.expectError(error.InvalidCellInsetsInnerBox, plan.write(a, &tree, .{ .before = before, .value = .{ .custom = .{ 9800, null, null, null } } }, ticket, false, raw.len + 100));
}
test "original cell insets HX protected source refusal preserves source" {
    const a = std.testing.allocator;
    const protected = try std.mem.replaceOwned(u8, a, raw, "protect='0'", "protect='1'");
    defer a.free(protected);
    var tree = try @import("section_tree.zig").parse(a, protected, 0, 0, .{});
    defer tree.deinit(a);
    const before = try plan.observe(a, &tree, try template(&tree), ticket, false);
    try std.testing.expectError(error.OriginalCellInsetsReadOnly, plan.write(a, &tree, .{ .before = before, .value = .inherit }, ticket, false, protected.len));
}

test "original cell insets HX absent and duplicate declarations are not defaults" {
    const a = std.testing.allocator;
    for ([_]struct { old: []const u8, new: []const u8, expected: anyerror }{
        .{ .old = "hasMargin='0'", .new = "", .expected = error.UnknownCellInsets },
        .{ .old = "<p:inMargin left='100' right='200' top='300' bottom='400'/>", .new = "<p:inMargin/><p:inMargin/>", .expected = error.DuplicateCellInsetsOwner },
        .{ .old = "left='10'", .new = "left='32768'", .expected = error.UnsupportedCellInsets },
    }) |case| {
        const bytes = try std.mem.replaceOwned(u8, a, raw, case.old, case.new);
        defer a.free(bytes);
        var tree = try @import("section_tree.zig").parse(a, bytes, 0, 0, .{});
        defer tree.deinit(a);
        if (case.expected == error.DuplicateCellInsetsOwner) {
            try std.testing.expectError(case.expected, plan.observe(a, &tree, try template(&tree), ticket, false));
        } else {
            const before = try plan.observe(a, &tree, try template(&tree), ticket, false);
            try std.testing.expectError(case.expected, plan.write(a, &tree, .{ .before = before, .value = .inherit }, ticket, false, bytes.len));
        }
        try std.testing.expectEqualSlices(u8, bytes, tree.source);
    }
}

test "managed cell insets HX source preparation allocation failures" {
    const a = std.testing.allocator;
    var plain = try @import("section_tree.zig").parse(a, raw, 0, 0, .{});
    defer plain.deinit(a);
    const witness = try plan.observe(a, &plain, try template(&plain), ticket, false);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("xml_part_tree.zig").Tree, observed: plan.Observation) !void {
            const output = (try plan.write(allocator, source, .{ .before = observed, .value = .{ .custom = .{ 720, null, null, null } } }, ticket, false, raw.len + 100)).?;
            defer allocator.free(output);
        }
    }.run, .{ &plain, witness });
}
