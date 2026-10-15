//! HWPX table lookup over current Sites; no cached results or default zeros.
const std = @import("std");
const fields = @import("table_xml_fields.zig");
const owner_mod = @import("formula_cell_owner.zig");
const ranges = @import("../model/formula_range.zig");
pub const Limits = @import("../hwp5/body/formula_values.zig").Limits;
pub const Result = struct { value: f64, cells: usize, inspections: usize };

pub fn evaluate(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, marker: usize, range: ranges.Range, limits: Limits) !Result {
    return evaluateWith(a, tree, sites, marker, range, limits, SourceReader{});
}

const SourceReader = struct {
    pub fn readScalar(_: SourceReader, a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, cell: usize) !@import("formula_cell_number.zig").Scalar {
        return @import("formula_cell_number.zig").classifySelected(a, tree, sites, cell, null);
    }
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
    inline for (.{ "PRODUCT(A1,A1,A1)", "SUM(A1,A1,A1)", "AVG(A1,A1,A1)", "SUM(A1)", "MIN(A1,A1,A1)", "MAX(A1)" }, .{ @as(f64, 8), @as(f64, 6), @as(f64, 2), @as(f64, 2), @as(f64, 2), @as(f64, 2) }) |expression, expected| {
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

test "HWPX SUM and AVG skip classified text while PRODUCT remains strict" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, @import("test_formula_fixture.zig").section, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const marker = for (tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) break index;
    } else return error.TestExpectedEqual;
    const text = try a.dupe(u8, "공용면적에 포함");
    a.free(sites.items[0].text);
    sites.items[0].text = text;
    var range: ranges.Range = .{ .function = .sum, .first = .{ .column = .{ .absolute = 0 }, .row = .{ .absolute = 0 } }, .last = .{ .column = .{ .absolute = 0 }, .row = .{ .absolute = 0 } } };
    const result = try evaluate(a, &tree, &sites, marker, range, .{});
    try std.testing.expectEqual(@as(f64, 0), result.value);
    try std.testing.expectEqual(@as(usize, 1), result.cells);
    range.function = .average;
    try std.testing.expectEqual(@as(f64, 0), (try evaluate(a, &tree, &sites, marker, range, .{})).value);
    range.function = .product;
    try std.testing.expectError(error.InvalidFormulaNumber, evaluate(a, &tree, &sites, marker, range, .{}));
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
    var maximum = product;
    maximum.function = .maximum;
    try std.testing.expectEqual(@as(f64, -3), (try evaluateWith(a, &tree, &sites, marker, maximum, .{}, numeric)).value);
    numeric.value = 0;
    try std.testing.expectEqual(@as(f64, 0), (try evaluateWith(a, &tree, &sites, marker, product, .{}, numeric)).value);
    numeric.value = 1e308;
    try std.testing.expectError(error.FormulaNumericOverflow, evaluateWith(a, &tree, &sites, marker, product, .{}, numeric));
}

/// Cell interpretation is injected; lookup, shape and budget checks remain SSOT.
pub fn evaluateWith(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, marker: usize, range: ranges.Range, limits: Limits, reader: anytype) !Result {
    const owner = try owner_mod.read(a, tree, marker);
    var selection = try @import("../model/formula_selection.zig").Iterator.init(range, owner.origin, owner.columns, owner.rows);
    const count = selection.count;
    if (count > limits.cells) return error.LimitExceeded;
    if (@hasDecl(@TypeOf(reader), "charge")) try reader.charge(count, 0);
    var remaining = limits.inspections;
    const aggregate = @import("../model/range_aggregate.zig");
    var sum = aggregate.initial(range.function);
    var numeric_count: usize = 0;
    while (selection.next()) |coordinate| {
        const row = coordinate.row;
        const column = coordinate.column;
        var found: ?usize = null;
        var selected_rectangle: ?@import("formula_cell_rectangle.zig").Rectangle = null;
        var row_cursor = tree.elements[owner.table].first_child;
        while (row_cursor) |row_element| : (row_cursor = tree.elements[row_element].next_sibling) {
            if (!fields.childIs(tree, row_element, "tr")) continue;
            var cursor = tree.elements[row_element].first_child;
            while (cursor) |cell| : (cursor = tree.elements[cell].next_sibling) {
                if (remaining == 0) return error.LimitExceeded;
                remaining -= 1;
                if (@hasDecl(@TypeOf(reader), "charge")) try reader.charge(0, 1);
                if (!fields.childIs(tree, cell, "tc")) continue;
                const rectangle = try @import("formula_cell_rectangle.zig").read(a, tree, cell, owner.columns, owner.rows);
                if (!rectangle.contains(column, row)) continue;
                if (rectangle.merged() and (column != rectangle.column or row != rectangle.row) and (range.function != .sum or !@hasDecl(@TypeOf(reader), "readScalar"))) return error.UnsupportedMergedFormulaCell;
                if (found != null) return error.AmbiguousFormulaCell;
                found = cell;
                selected_rectangle = rectangle;
            }
        }
        const selected = found orelse return error.MissingFormulaCell;
        if (selected_rectangle.?.merged()) {
            var other_row = tree.elements[owner.table].first_child;
            while (other_row) |tr| : (other_row = tree.elements[tr].next_sibling) {
                if (!fields.childIs(tree, tr, "tr")) continue;
                var other_cell = tree.elements[tr].first_child;
                while (other_cell) |cell| : (other_cell = tree.elements[cell].next_sibling) {
                    if (remaining == 0) return error.LimitExceeded;
                    remaining -= 1;
                    if (@hasDecl(@TypeOf(reader), "charge")) try reader.charge(0, 1);
                    if (cell == selected or !fields.childIs(tree, cell, "tc")) continue;
                    const rectangle = try @import("formula_cell_rectangle.zig").read(a, tree, cell, owner.columns, owner.rows);
                    if (selected_rectangle.?.overlaps(rectangle)) return error.AmbiguousFormulaCell;
                }
            }
        }
        // Numeric projection visits both the XML structure and current
        // sites; charge those full traversals before entering them.
        const projection_cost = std.math.add(usize, tree.elements.len, sites.items.len) catch return error.LimitExceeded;
        if (projection_cost > remaining) return error.LimitExceeded;
        remaining -= projection_cost;
        if (@hasDecl(@TypeOf(reader), "charge")) try reader.charge(0, projection_cost);
        const value = if ((range.function == .sum or range.function == .average) and @hasDecl(@TypeOf(reader), "readScalar")) scalar: {
            const classified = try reader.readScalar(a, tree, sites, selected);
            switch (classified) {
                .text, .empty => continue,
                .number => |number| {
                    const rectangle = selected_rectangle.?;
                    if (column != rectangle.column or row != rectangle.row) return error.UnsupportedMergedFormulaCell;
                    break :scalar number;
                },
            }
        } else try reader.read(a, tree, sites, selected);
        sum = try aggregate.step(range.function, sum, value);
        numeric_count += 1;
    }
    const result = if (range.function == .average and numeric_count == 0) @as(f64, 0) else try aggregate.finish(range.function, sum, if (range.function == .average) numeric_count else count);
    return .{ .value = result, .cells = count, .inspections = limits.inspections - remaining };
}

test "HWPX average scalar counts numeric inputs rather than selected cells" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, @import("test_formula_fixture.zig").section, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const marker = for (tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) break index;
    } else return error.MissingFormulaFieldNode;
    var range: ranges.Range = .{ .function = .average, .first = .{ .column = .{ .absolute = 0 }, .row = .{ .absolute = 0 } }, .last = .{ .column = .{ .absolute = 0 }, .row = .{ .absolute = 0 } } };
    range.address_count = 3;
    @memset(range.addresses[0..3], range.first);
    const Reader = struct {
        count: *usize,
        empty: bool,
        value: f64 = 12,
        fail: bool = false,
        pub fn readScalar(self: @This(), _: std.mem.Allocator, _: *const @import("xml_part_tree.zig").Tree, _: *const @import("text_sites.zig").Sites, _: usize) !@import("formula_cell_number.zig").Scalar {
            self.count.* += 1;
            if (self.fail) return error.TestScalarReaderFailure;
            if (self.empty or self.count.* == 2) return .empty;
            if (self.count.* == 3) return .text;
            return .{ .number = self.value };
        }
        pub fn read(_: @This(), _: std.mem.Allocator, _: *const @import("xml_part_tree.zig").Tree, _: *const @import("text_sites.zig").Sites, _: usize) !f64 {
            return error.UnexpectedStrictRead;
        }
    };
    for ([_]bool{ false, true }) |empty| {
        var calls: usize = 0;
        const result = try evaluateWith(a, &tree, &sites, marker, range, .{}, Reader{ .count = &calls, .empty = empty });
        try std.testing.expectEqual(@as(usize, 3), calls);
        try std.testing.expectEqual(@as(usize, 3), result.cells);
        try std.testing.expectEqual(if (empty) @as(f64, 0) else @as(f64, 12), result.value);
    }
    var calls: usize = 0;
    const reader = Reader{ .count = &calls, .empty = true };
    try std.testing.expectError(error.LimitExceeded, evaluateWith(a, &tree, &sites, marker, range, .{ .cells = 0 }, reader));
    try std.testing.expectError(error.LimitExceeded, evaluateWith(a, &tree, &sites, marker, range, .{ .inspections = 0 }, reader));
    try std.testing.expectEqual(@as(usize, 0), calls);
    try std.testing.expectError(error.TestScalarReaderFailure, evaluateWith(a, &tree, &sites, marker, range, .{}, Reader{ .count = &calls, .empty = false, .fail = true }));
    try std.testing.expectEqual(@as(usize, 1), calls);
    for ([_]f64{ std.math.nan(f64), std.math.inf(f64), -std.math.inf(f64) }) |value| {
        calls = 0;
        try std.testing.expectError(error.FormulaNumericOverflow, evaluateWith(a, &tree, &sites, marker, range, .{}, Reader{ .count = &calls, .empty = false, .value = value }));
        try std.testing.expectEqual(@as(usize, 1), calls);
    }
}

test "HWPX formula values reject missing duplicate overlapping cells and survive allocation failures" {
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
            3 => try std.testing.expectError(error.AmbiguousFormulaCell, evaluate(a, &tree, &sites, marker, range, .{})),
            else => unreachable,
        }
    }
}
