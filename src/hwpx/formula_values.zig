//! HWPX table lookup over current Sites; no cached results or default zeros.
const std = @import("std");
const fields = @import("table_xml_fields.zig");
const owner_mod = @import("formula_cell_owner.zig");
const ranges = @import("../hwp5/body/formula_range.zig");
pub const Limits = @import("../hwp5/body/formula_values.zig").Limits;
pub const Result = struct { value: f64, cells: usize, inspections: usize };

pub fn evaluate(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, marker: usize, range: ranges.Range, limits: Limits) !Result {
    return evaluateWith(a, tree, sites, marker, range, limits, SourceReader{});
}

const SourceReader = struct {
    fn read(_: SourceReader, a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, cell: usize) !f64 {
        return @import("formula_cell_number.zig").read(a, tree, sites, cell);
    }
};

fn explicitArithmeticCase(a: std.mem.Allocator) !void {
    var tree = try @import("xml_part_tree.zig").parse(a, @import("test_formula_fixture.zig").section, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const marker = for (tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) break index;
    } else return error.TestExpectedEqual;
    inline for (.{ "PRODUCT(A1,A1,A1)", "SUM(A1,A1,A1)", "AVG(A1,A1,A1)", "SUM(A1)" }, .{ @as(f64, 8), @as(f64, 6), @as(f64, 2), @as(f64, 2) }) |expression, expected| {
        const wire = try std.unicode.utf8ToUtf16LeAlloc(a, expression);
        defer a.free(wire);
        const range = try ranges.Range.parse(std.mem.sliceAsBytes(wire));
        const result = try evaluate(a, &tree, &sites, marker, range, .{});
        try std.testing.expectEqual(expected, result.value);
        try std.testing.expectEqual(@as(usize, if (range.address_count == 0) 1 else 3), result.cells);
        try std.testing.expectError(error.LimitExceeded, evaluate(std.testing.allocator, &tree, &sites, marker, range, .{ .cells = 0 }));
    }
}

test "HWPX formula explicit arithmetic multiplies rather than sums and preserves repeated cells under OOM" {
    try explicitArithmeticCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(explicitArithmeticCase, .{});
}

test "HWPX formula injected cell reader preserves lookup limits and propagates errors" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, @import("test_formula_fixture.zig").section, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    var marker: usize = 0;
    var input: ?usize = null;
    for (tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) marker = index;
        if (input == null and element.is(@import("document_xml.zig").paragraph_uri, "tc")) input = index;
    }
    const range: ranges.Range = .{ .function = .sum, .first = .{ .column = .{ .absolute = 0 }, .row = .{ .absolute = 0 } }, .last = .{ .column = .{ .absolute = 0 }, .row = .{ .absolute = 0 } } };
    var calls: usize = 0;
    const Reader = struct {
        calls: *usize,
        expected: usize,
        fail: bool = false,
        value: f64 = 42,
        pub fn read(self: @This(), _: std.mem.Allocator, _: *const @import("xml_part_tree.zig").Tree, _: *const @import("text_sites.zig").Sites, cell: usize) !f64 {
            try std.testing.expectEqual(self.expected, cell);
            self.calls.* += 1;
            if (self.fail) return error.TestCellReaderFailure;
            return self.value;
        }
    };
    const reader: Reader = .{ .calls = &calls, .expected = input.? };
    try std.testing.expectEqual(@as(f64, 42), (try evaluateWith(a, &tree, &sites, marker, range, .{}, reader)).value);
    try std.testing.expectEqual(@as(usize, 1), calls);
    try std.testing.expectError(error.LimitExceeded, evaluateWith(a, &tree, &sites, marker, range, .{ .cells = 0 }, reader));
    try std.testing.expectEqual(@as(usize, 1), calls);
    var failed = reader;
    failed.fail = true;
    try std.testing.expectError(error.TestCellReaderFailure, evaluateWith(a, &tree, &sites, marker, range, .{}, failed));
    try std.testing.expectEqual(@as(usize, 2), calls);
    var product = range;
    product.function = .product;
    product.address_count = 2;
    product.addresses[0] = range.first;
    product.addresses[1] = range.first;
    var numeric = reader;
    numeric.value = -3;
    try std.testing.expectEqual(@as(f64, 9), (try evaluateWith(a, &tree, &sites, marker, product, .{}, numeric)).value);
    numeric.value = 0;
    try std.testing.expectEqual(@as(f64, 0), (try evaluateWith(a, &tree, &sites, marker, product, .{}, numeric)).value);
    numeric.value = 1e308;
    try std.testing.expectError(error.FormulaNumericOverflow, evaluateWith(a, &tree, &sites, marker, product, .{}, numeric));
}

/// Cell interpretation is injected; lookup, shape and budget checks remain SSOT.
pub fn evaluateWith(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, marker: usize, range: ranges.Range, limits: Limits, reader: anytype) !Result {
    const owner = try owner_mod.read(a, tree, marker);
    var selection = try @import("../hwp5/body/formula_selection.zig").Iterator.init(range, owner.origin, owner.columns, owner.rows);
    const count = selection.count;
    if (count > limits.cells) return error.LimitExceeded;
    if (@hasDecl(@TypeOf(reader), "charge")) try reader.charge(count, 0);
    var remaining = limits.inspections;
    var sum: f64 = if (range.function == .product) 1 else 0;
    while (selection.next()) |coordinate| {
        const row = coordinate.row;
        const column = coordinate.column;
        var found: ?usize = null;
        var row_cursor = tree.elements[owner.table].first_child;
        while (row_cursor) |row_element| : (row_cursor = tree.elements[row_element].next_sibling) {
            if (!fields.childIs(tree, row_element, "tr")) continue;
            var cursor = tree.elements[row_element].first_child;
            while (cursor) |cell| : (cursor = tree.elements[cell].next_sibling) {
                if (remaining == 0) return error.LimitExceeded;
                remaining -= 1;
                if (@hasDecl(@TypeOf(reader), "charge")) try reader.charge(0, 1);
                if (!fields.childIs(tree, cell, "tc")) continue;
                var missing: usize = 0;
                var duplicate: usize = 0;
                const addr = fields.uniqueChild(tree, cell, "cellAddr", &missing, &duplicate) orelse return error.InvalidFormulaCellAddress;
                const span = fields.uniqueChild(tree, cell, "cellSpan", &missing, &duplicate) orelse return error.InvalidFormulaCellSpan;
                const c = try fields.optionalUnsigned(a, tree, addr, "colAddr", 4096) orelse return error.InvalidFormulaCellAddress;
                const r = try fields.optionalUnsigned(a, tree, addr, "rowAddr", 4096) orelse return error.InvalidFormulaCellAddress;
                const cs = try fields.optionalUnsigned(a, tree, span, "colSpan", 4096) orelse return error.InvalidFormulaCellSpan;
                const rs = try fields.optionalUnsigned(a, tree, span, "rowSpan", 4096) orelse return error.InvalidFormulaCellSpan;
                if (cs == 0 or rs == 0 or c >= owner.columns or r >= owner.rows or cs > owner.columns - c or rs > owner.rows - r) return error.InvalidFormulaCellSpan;
                if (column < c or row < r or column - c >= cs or row - r >= rs) continue;
                if (cs != 1 or rs != 1) return error.UnsupportedMergedFormulaCell;
                if (found != null) return error.AmbiguousFormulaCell;
                found = cell;
            }
        }
        const selected = found orelse return error.MissingFormulaCell;
        // Numeric projection visits both the XML structure and current
        // sites; charge those full traversals before entering them.
        const projection_cost = std.math.add(usize, tree.elements.len, sites.items.len) catch return error.LimitExceeded;
        if (projection_cost > remaining) return error.LimitExceeded;
        remaining -= projection_cost;
        if (@hasDecl(@TypeOf(reader), "charge")) try reader.charge(0, projection_cost);
        const value = try reader.read(a, tree, sites, selected);
        if (range.function == .product) sum *= value else sum += value;
        if (!std.math.isFinite(sum)) return error.FormulaNumericOverflow;
    }
    return .{ .value = if (range.function == .average) sum / @as(f64, @floatFromInt(count)) else sum, .cells = count, .inspections = limits.inspections - remaining };
}

test "HWPX formula values reject missing duplicate merged cells and survive allocation failures" {
    const a = std.testing.allocator;
    const input_cells = [_][]const u8{
        "<p:tc><p:cellAddr colAddr='0' rowAddr='0'/><p:cellSpan colSpan='1' rowSpan='1'/><p:subList><p:p><p:run><p:t>12.5</p:t></p:run></p:p></p:subList></p:tc>",
        "",
        "<p:tc><p:cellAddr colAddr='0' rowAddr='0'/><p:cellSpan colSpan='1' rowSpan='1'/></p:tc><p:tc><p:cellAddr colAddr='0' rowAddr='0'/><p:cellSpan colSpan='1' rowSpan='1'/></p:tc>",
        "<p:tc><p:cellAddr colAddr='0' rowAddr='0'/><p:cellSpan colSpan='2' rowSpan='1'/></p:tc>",
    };
    const range: ranges.Range = .{ .function = .sum, .first = .{ .column = .{ .absolute = 0 }, .row = .{ .absolute = 0 } }, .last = .{ .column = .{ .absolute = 0 }, .row = .{ .absolute = 0 } } };
    for (input_cells, 0..) |cells, case| {
        const source = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:tbl colCnt='2' rowCnt='1'><p:tr>", cells, "<p:tc><p:cellAddr colAddr='1' rowAddr='0'/><p:cellSpan colSpan='1' rowSpan='1'/><p:subList><p:p><p:run><p:ctrl><p:fieldBegin/></p:ctrl></p:run></p:p></p:subList></p:tc></p:tr></p:tbl></s:sec>" });
        defer a.free(source);
        var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
        defer tree.deinit(a);
        var sites = try @import("text_sites.zig").collect(a, &tree, .{});
        defer sites.deinit(a);
        var marker: usize = 0;
        for (tree.elements, 0..) |_, index| if (fields.childIs(&tree, index, "fieldBegin")) {
            marker = index;
        };
        switch (case) {
            0 => try std.testing.checkAllAllocationFailures(a, struct {
                fn run(allocator: std.mem.Allocator, t: *@import("xml_part_tree.zig").Tree, s: *@import("text_sites.zig").Sites, m: usize, r: ranges.Range) !void {
                    const result = try evaluate(allocator, t, s, m, r, .{});
                    try std.testing.expectEqual(@as(f64, 12.5), result.value);
                    try std.testing.expectEqual(@as(usize, 1), result.cells);
                    var avg = r;
                    avg.function = .average;
                    try std.testing.expectEqual(@as(f64, 12.5), (try evaluate(allocator, t, s, m, avg, .{})).value);
                }
            }.run, .{ &tree, &sites, marker, range }),
            1 => try std.testing.expectError(error.MissingFormulaCell, evaluate(a, &tree, &sites, marker, range, .{})),
            2 => try std.testing.expectError(error.AmbiguousFormulaCell, evaluate(a, &tree, &sites, marker, range, .{})),
            3 => try std.testing.expectError(error.UnsupportedMergedFormulaCell, evaluate(a, &tree, &sites, marker, range, .{})),
            else => unreachable,
        }
    }
}
