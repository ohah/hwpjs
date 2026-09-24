const std = @import("std");
const section_tree = @import("section_tree.zig");
const geometry = @import("table_geometry.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'>";

fn inspectXml(a: std.mem.Allocator, body: []const u8, options: geometry.Options) !geometry.Report {
    const source = try std.fmt.allocPrint(a, "{s}{s}</s:sec>", .{ prefix, body });
    defer a.free(source);
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    return geometry.inspect(a, &.{tree}, options);
}

test "HWPX table geometry counts direct rows cells and merged occupancy" {
    const a = std.testing.allocator;
    const body = "<p:tbl rowCnt='2' colCnt='2'>" ++
        "<p:tr><p:tc><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='2' colSpan='1'/><p:subList><p:p><p:run><p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/></p:tc></p:tr></p:tbl></p:run></p:p></p:subList></p:tc>" ++
        "<p:tc><p:cellAddr rowAddr='0' colAddr='1'/><p:cellSpan rowSpan='1' colSpan='1'/></p:tc></p:tr>" ++
        "<p:tr><p:tc><p:cellAddr rowAddr='1' colAddr='1'/><p:cellSpan rowSpan='1' colSpan='1'/></p:tc></p:tr></p:tbl>";
    const report = try inspectXml(a, body, .{});
    try std.testing.expectEqual(@as(usize, 1), report.sections);
    try std.testing.expectEqual(@as(usize, 2), report.tables);
    try std.testing.expectEqual(@as(usize, 3), report.rows);
    try std.testing.expectEqual(@as(usize, 4), report.cells);
    try std.testing.expectEqual(@as(usize, 5), report.grid_slots);
    try std.testing.expectEqual(@as(usize, 5), report.cell_slots);
    try std.testing.expectEqual(@as(usize, 0), report.overlaps);
    try std.testing.expectEqual(@as(usize, 0), report.uncovered_slots);
}

test "HWPX table geometry reports holes overlaps and out of range cells" {
    const report = try inspectXml(std.testing.allocator, "<p:tbl rowCnt='1' colCnt='3'><p:tr>" ++
        "<p:tc><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/></p:tc>" ++
        "<p:tc><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/></p:tc>" ++
        "<p:tc><p:cellAddr rowAddr='0' colAddr='3'/><p:cellSpan rowSpan='1' colSpan='1'/></p:tc>" ++
        "</p:tr></p:tbl>", .{});
    try std.testing.expectEqual(@as(usize, 1), report.overlaps);
    try std.testing.expectEqual(@as(usize, 1), report.outside_grid);
    try std.testing.expectEqual(@as(usize, 2), report.uncovered_slots);
}

test "HWPX table geometry keeps missing duplicate and foreign children distinct" {
    const report = try inspectXml(std.testing.allocator, "<p:tbl rowCnt='2' colCnt='1'><p:tr><p:tc>" ++
        "<x:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/>" ++
        "</p:tc><p:tc><p:cellAddr rowAddr='1' colAddr='0'/><p:cellAddr rowAddr='0' colAddr='0'/>" ++
        "<p:cellSpan rowSpan='1' colSpan='1'/><p:cellSpan rowSpan='1' colSpan='1'/></p:tc></p:tr></p:tbl>", .{});
    try std.testing.expectEqual(@as(usize, 1), report.row_count_mismatch);
    try std.testing.expectEqual(@as(usize, 1), report.missing_address);
    try std.testing.expectEqual(@as(usize, 1), report.duplicate_address);
    try std.testing.expectEqual(@as(usize, 1), report.duplicate_span);
    try std.testing.expectEqual(@as(usize, 2), report.uncovered_slots);
}

test "HWPX table geometry distinguishes absent scalars, zero spans and row addresses" {
    const report = try inspectXml(std.testing.allocator, "<p:tbl rowCnt='&#50;' colCnt='1'><p:tr>" ++
        "<p:tc><p:cellAddr rowAddr='1'/><p:cellSpan rowSpan='0' colSpan='1'/></p:tc>" ++
        "<p:tc><p:cellAddr rowAddr='1' colAddr='0'/><p:cellSpan rowSpan='4294967295' colSpan='1'/></p:tc>" ++
        "</p:tr><p:tr/></p:tbl>", .{});
    try std.testing.expectEqual(@as(usize, 1), report.empty_rows);
    try std.testing.expectEqual(@as(usize, 1), report.missing_coordinate);
    try std.testing.expectEqual(@as(usize, 1), report.zero_span);
    try std.testing.expectEqual(@as(usize, 2), report.row_address_mismatch);
    try std.testing.expectEqual(@as(usize, 1), report.outside_grid);
    try std.testing.expectEqual(@as(usize, 2), report.uncovered_slots);
}

test "HWPX table geometry does not mistake prefixed attributes for table declarations" {
    const report = try inspectXml(std.testing.allocator, "<p:tbl x:rowCnt='1' x:colCnt='1'><p:tr><p:tc><p:cellAddr x:rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/></p:tc></p:tr></p:tbl>", .{});
    try std.testing.expectEqual(@as(usize, 1), report.missing_row_count);
    try std.testing.expectEqual(@as(usize, 1), report.missing_column_count);
    try std.testing.expectEqual(@as(usize, 1), report.missing_coordinate);
}

test "HWPX table geometry separates missing span element from missing span value" {
    const report = try inspectXml(std.testing.allocator, "<p:tbl rowCnt='1' colCnt='2'><p:tr>" ++
        "<p:tc><p:cellAddr rowAddr='0' colAddr='0'/></p:tc>" ++
        "<p:tc><p:cellAddr rowAddr='0' colAddr='1'/><p:cellSpan rowSpan='1'/></p:tc>" ++
        "</p:tr></p:tbl>", .{});
    try std.testing.expectEqual(@as(usize, 1), report.missing_span);
    try std.testing.expectEqual(@as(usize, 1), report.missing_span_value);
    try std.testing.expectEqual(@as(usize, 2), report.uncovered_slots);
}

test "HWPX table geometry still validates the surviving child of an incomplete cell" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.InvalidNonNegativeInteger, inspectXml(a, "<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc><p:cellSpan rowSpan='-1' colSpan='1'/></p:tc></p:tr></p:tbl>", .{}));
    try std.testing.expectError(error.InvalidNonNegativeInteger, inspectXml(a, "<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc><p:cellAddr rowAddr='0' colAddr='-1'/></p:tc></p:tr></p:tbl>", .{}));
}

test "HWPX table geometry can report zero span and outside grid together" {
    const report = try inspectXml(std.testing.allocator, "<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc><p:cellAddr rowAddr='0' colAddr='1'/><p:cellSpan rowSpan='0' colSpan='1'/></p:tc></p:tr></p:tbl>", .{});
    try std.testing.expectEqual(@as(usize, 1), report.zero_span);
    try std.testing.expectEqual(@as(usize, 1), report.outside_grid);
    try std.testing.expectEqual(@as(usize, 1), report.uncovered_slots);
}

test "HWPX table geometry rejects malformed scalars and enforces grid budget" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.InvalidNonNegativeInteger, inspectXml(a, "<p:tbl rowCnt='-1' colCnt='1'/>", .{}));
    try std.testing.expectError(error.InvalidUnsigned32, inspectXml(a, "<p:tbl rowCnt='4294967296' colCnt='1'/>", .{}));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl rowCnt='11' colCnt='10'/>", .{ .max_grid_slots = 100 }));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl rowCnt='1' colCnt='1'/>", .{ .max_tables = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl rowCnt='1' colCnt='1'/>", .{ .max_attribute_bytes = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl rowCnt='1' colCnt='1'/><p:tbl rowCnt='1' colCnt='1'/>", .{ .max_total_grid_slots = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl rowCnt='1' colCnt='2'><p:tr><p:tc><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='2'/></p:tc></p:tr></p:tbl>", .{ .max_total_cell_slots = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/></p:tc></p:tr></p:tbl><p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/></p:tc></p:tr></p:tbl>", .{ .max_total_cell_slots = 1 }));
}

test "HWPX table geometry survives every allocation failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            const result = try inspectXml(a, "<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/></p:tc></p:tr></p:tbl>", .{});
            try std.testing.expectEqual(@as(usize, 0), result.uncovered_slots);
        }
    }.run, .{});
}
