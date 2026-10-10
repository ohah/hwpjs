//! Source cell margin selection, not inherited display padding.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
pub const Values = struct { has_margin: ?bool = null, header: ?bool = null, margin: ?[4]?i64 = null };

pub fn readList(a: std.mem.Allocator, tree: *const Tree, list: usize) !Values {
    if (list >= tree.elements.len or !fields.childIs(tree, list, "subList")) return error.InvalidTableCellMarginList;
    const cell = tree.elements[list].parent orelse return error.InvalidTableCellMarginList;
    if (!fields.childIs(tree, cell, "tc")) return error.InvalidTableCellMarginList;
    const row = tree.elements[cell].parent orelse return error.InvalidTableCellMarginList;
    if (!fields.childIs(tree, row, "tr")) return error.InvalidTableCellMarginList;
    const table = tree.elements[row].parent orelse return error.InvalidTableCellMarginList;
    if (!fields.childIs(tree, table, "tbl")) return error.InvalidTableCellMarginList;
    return read(a, tree, cell);
}

pub fn read(a: std.mem.Allocator, tree: *const Tree, cell: usize) !Values {
    if (cell >= tree.elements.len or !fields.childIs(tree, cell, "tc")) return error.InvalidTableCellMarginNode;
    var result: Values = .{};
    if (try tree.attributeValue(a, cell, "", "hasMargin")) |raw| result.has_margin = try fields.boolean(a, raw, 4096);
    if (try tree.attributeValue(a, cell, "", "header")) |raw| result.header = try fields.boolean(a, raw, 4096);
    var missing: usize = 0;
    var duplicate: usize = 0;
    const node = fields.uniqueChild(tree, cell, "cellMargin", &missing, &duplicate);
    if (duplicate != 0) return error.DuplicateTableCellMargin;
    if (node) |index| {
        var values: [4]?i64 = @splat(null);
        for (fields.margin_names, 0..) |name, field| {
            if (try tree.attributeValue(a, index, "", name)) |raw| values[field] = try fields.margin(a, raw, 4096);
        }
        result.margin = values;
    }
    return result;
}

fn allocationCase(a: std.mem.Allocator) !void {
    var tree = try @import("section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:tc hasMargin='0' header='1'><p:cellMargin left='-1' right='4294967295' top='0'/></p:tc><p:tc/><p:tc><p:cellMargin/><p:cellMargin/></p:tc></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectEqualDeep(Values{ .has_margin = false, .header = true, .margin = .{ -1, 4294967295, 0, null } }, try read(a, &tree, 1));
    try std.testing.expectEqualDeep(Values{}, try read(a, &tree, 3));
    try std.testing.expectError(error.DuplicateTableCellMargin, read(a, &tree, 4));
    try std.testing.expectError(error.InvalidTableCellMarginNode, read(a, &tree, 0));
}

test "HWPX cell margin selection preserves flags absence range and allocation failures" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}

test "HWPX cell margin selection actual false flag with present margins" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const tree = &session.sections[0].tree;
    var count: usize = 0;
    for (tree.elements, 0..) |_, node| {
        if (!fields.childIs(tree, node, "tc")) continue;
        try std.testing.expectEqualDeep(Values{ .has_margin = false, .header = false, .margin = .{ 141, 141, 141, 141 } }, try read(a, tree, node));
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 4), count);
}
