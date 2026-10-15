//! Compare the batched adapter with the previous four-lookup implementation.
const std = @import("std");
const fields = @import("table_xml_fields.zig");
const rect = @import("formula_cell_rectangle.zig");
const Tree = @import("xml_part_tree.zig").Tree;

fn previous(a: std.mem.Allocator, tree: *const Tree, cell: usize, columns: u32, rows: u32) !rect.Rectangle {
    if (cell >= tree.elements.len or !fields.childIs(tree, cell, "tc")) return error.InvalidFormulaCellAddress;
    var missing: usize = 0;
    var duplicate: usize = 0;
    const address = fields.uniqueChild(tree, cell, "cellAddr", &missing, &duplicate) orelse return error.InvalidFormulaCellAddress;
    const span = fields.uniqueChild(tree, cell, "cellSpan", &missing, &duplicate) orelse return error.InvalidFormulaCellSpan;
    const c = try fields.optionalUnsigned(a, tree, address, "colAddr", 4096) orelse return error.InvalidFormulaCellAddress;
    const r = try fields.optionalUnsigned(a, tree, address, "rowAddr", 4096) orelse return error.InvalidFormulaCellAddress;
    const cs = try fields.optionalUnsigned(a, tree, span, "colSpan", 4096) orelse return error.InvalidFormulaCellSpan;
    const rs = try fields.optionalUnsigned(a, tree, span, "rowSpan", 4096) orelse return error.InvalidFormulaCellSpan;
    if (cs == 0 or rs == 0 or c >= columns or r >= rows or cs > columns - c or rs > rows - r) return error.InvalidFormulaCellSpan;
    return .{ .column = c, .row = r, .columns = cs, .rows = rs };
}

test "batched formula rectangles preserve numeric values and error precedence in both encodings" {
    const a = std.testing.allocator;
    const cases = [_][]const u8{
        "<p:cellAddr colAddr='1' rowAddr='2'/><p:cellSpan colSpan='1' rowSpan='1'/>",
        "<p:cellAddr rowAddr='&#50;' colAddr='&#x31;'/><p:cellSpan rowSpan='1' colSpan='1'/>",
        "<p:cellAddr p:colAddr='99' colAddr='1' rowAddr='2'/><p:cellSpan colSpan='1' rowSpan='1'/>",
        "<p:cellAddr rowAddr='bad'/><p:cellSpan colSpan='1' rowSpan='1'/>",
        "<p:cellAddr colAddr='bad'/><p:cellSpan colSpan='1' rowSpan='1'/>",
        "<p:cellAddr colAddr='1' rowAddr='2'/><p:cellSpan rowSpan='bad'/>",
        "<p:cellAddr colAddr='1' rowAddr='2'/><p:cellSpan colSpan='bad'/>",
        "<p:cellAddr colAddr='4294967296' rowAddr='2'/><p:cellSpan colSpan='1' rowSpan='1'/>",
        "<p:cellAddr colAddr='-1' rowAddr='2'/><p:cellSpan colSpan='1' rowSpan='1'/>",
        "<p:cellAddr colAddr='4' rowAddr='2'/><p:cellSpan colSpan='1' rowSpan='1'/>",
        "<p:cellAddr colAddr='1' rowAddr='2'/><p:cellSpan colSpan='0' rowSpan='1'/>",
        "<p:cellAddr colAddr='1' rowAddr='2'/><p:cellAddr colAddr='1' rowAddr='2'/><p:cellSpan colSpan='1' rowSpan='1'/>",
        "<p:cellAddr colAddr='1' rowAddr='2'/>",
    };
    for (cases) |content| {
        const source = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:tbl><p:tr><p:tc>", content, "</p:tc></p:tr></p:tbl></s:sec>" });
        defer a.free(source);
        const units = try std.unicode.utf8ToUtf16LeAlloc(a, source);
        defer a.free(units);
        const utf16 = try std.mem.concat(a, u8, &.{ &.{ 0xff, 0xfe }, std.mem.sliceAsBytes(units) });
        defer a.free(utf16);
        for ([_][]const u8{ source, utf16 }) |encoded| {
            var tree = try @import("xml_part_tree.zig").parse(a, encoded, .section, 0, 0, .{});
            defer tree.deinit(a);
            if (previous(a, &tree, 3, 4, 4)) |expected| {
                try std.testing.expectEqualDeep(expected, try rect.read(a, &tree, 3, 4, 4));
            } else |err| try std.testing.expectError(err, rect.read(a, &tree, 3, 4, 4));
            try std.testing.expectError(error.InvalidFormulaCellAddress, rect.read(a, &tree, 0, 4, 4));
            try std.testing.expectError(error.InvalidFormulaCellAddress, rect.read(a, &tree, tree.elements.len, 4, 4));
            try std.testing.expectEqualSlices(u8, encoded, tree.source);
        }
    }
}

test "batched formula rectangles reduce allocations and retain every OOM point" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:tbl><p:tr><p:tc><p:cellAddr colAddr='1' rowAddr='2'/><p:cellSpan colSpan='1' rowSpan='1'/></p:tc></p:tr></p:tbl></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var before = std.testing.FailingAllocator.init(a, .{});
    const expected = try previous(before.allocator(), &tree, 3, 4, 4);
    var after = std.testing.FailingAllocator.init(a, .{});
    try std.testing.expectEqualDeep(expected, try rect.read(after.allocator(), &tree, 3, 4, 4));
    try std.testing.expect(after.allocations < before.allocations);
    try std.testing.expectEqual(before.allocated_bytes, before.freed_bytes);
    try std.testing.expectEqual(after.allocated_bytes, after.freed_bytes);
    std.debug.print("rectangle lookup allocations: previous={d} batched={d}\n", .{ before.allocations, after.allocations });
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, t: *const Tree, value: rect.Rectangle) !void {
            try std.testing.expectEqualDeep(value, try rect.read(allocator, t, 3, 4, 4));
        }
    }.run, .{ &tree, expected });
}
