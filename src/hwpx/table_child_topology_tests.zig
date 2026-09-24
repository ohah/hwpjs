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

test "HWPX table child topology keeps direct ownership and observed order distinct" {
    const report = try inspectXml(std.testing.allocator, "<p:tbl rowCnt='1' colCnt='2'><p:tr xmlns:y='urn:y' spare='1' x:flag='yes'><x:tc/><p:other><p:tc/></p:other>" ++
        "<p:tc name='' x:name='other'><x:before/><p:subList/><p:cellSpan rowSpan='1' colSpan='1'/><p:cellSz width='1' height='1'/><p:cellMargin left='0' right='0' top='0' bottom='0'/><p:cellAddr rowAddr='0' colAddr='0'/><x:subList/><p:unknown/></p:tc>" ++
        "<p:tc><p:subList/><p:cellAddr rowAddr='0' colAddr='1'/><p:cellSpan rowSpan='1' colSpan='1'/><p:cellSz width='1' height='1'/><p:cellMargin left='0' right='0' top='0' bottom='0'/></p:tc>" ++
        "</p:tr></p:tbl>", .{});
    const topology = report.table_child_topology;
    try std.testing.expectEqual(@as(usize, 1), topology.rows);
    try std.testing.expectEqual(@as(usize, 2), topology.cells);
    try std.testing.expectEqual(@as(usize, 2), topology.row_other_attributes);
    try std.testing.expectEqual(@as(usize, 2), topology.row_other_direct);
    try std.testing.expectEqual(@as(usize, 1), topology.row_foreign_direct);
    try std.testing.expectEqual(@as(usize, 1), topology.cell_other_attributes);
    try std.testing.expectEqual(@as(usize, 3), topology.cell_other_direct);
    try std.testing.expectEqual(@as(usize, 2), topology.cell_foreign_direct);
    try std.testing.expectEqual(@as(usize, 10), topology.cell_known_direct);
    try std.testing.expectEqual(@as(usize, 2), topology.cell_first_known_sub_list);
    try std.testing.expectEqual(@as(usize, 1), topology.cell_last_known_address);
    try std.testing.expectEqual(@as(usize, 1), topology.observed_common_sequence);
    try std.testing.expectEqual(@as(usize, 1), topology.observed_address_last_sequence);
    try std.testing.expectEqual(@as(usize, 0), topology.other_known_sequence);
    try std.testing.expectEqual(@as(usize, 0), report.uncovered_slots);
}

test "HWPX table child topology preserves missing children and noncanonical sequences" {
    const report = try inspectXml(std.testing.allocator, "<p:tbl rowCnt='1' colCnt='3'><p:tr><p:tc><p:cellAddr rowAddr='0' colAddr='0'/><p:subList/><p:subList/></p:tc><p:tc><p:cellSpan rowSpan='1' colSpan='1'/></p:tc><p:tc><x:unknown/></p:tc></p:tr></p:tbl>", .{});
    const topology = report.table_child_topology;
    try std.testing.expectEqual(@as(usize, 4), topology.cell_known_direct);
    try std.testing.expectEqual(@as(usize, 0), topology.cell_first_known_sub_list);
    try std.testing.expectEqual(@as(usize, 0), topology.cell_last_known_address);
    try std.testing.expectEqual(@as(usize, 1), topology.cell_other_direct);
    try std.testing.expectEqual(@as(usize, 1), topology.cell_foreign_direct);
    try std.testing.expectEqual(@as(usize, 3), topology.other_known_sequence);
    try std.testing.expectEqual(@as(usize, 1), report.cell_sub_lists.duplicate_cells);
    try std.testing.expectEqual(@as(usize, 2), report.missing_address);
}

test "HWPX table child topology does not collapse middle permutations" {
    const report = try inspectXml(std.testing.allocator, "<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc><p:subList/><p:cellSz width='1' height='1'/><p:cellSpan rowSpan='1' colSpan='1'/><p:cellMargin left='0' right='0' top='0' bottom='0'/><p:cellAddr rowAddr='0' colAddr='0'/></p:tc></p:tr></p:tbl>", .{});
    const topology = report.table_child_topology;
    try std.testing.expectEqual(@as(usize, 1), topology.cell_first_known_sub_list);
    try std.testing.expectEqual(@as(usize, 1), topology.cell_last_known_address);
    try std.testing.expectEqual(@as(usize, 0), topology.observed_common_sequence + topology.observed_address_last_sequence);
    try std.testing.expectEqual(@as(usize, 1), topology.other_known_sequence);
}

test "HWPX table child topology follows shared row and cell limits" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl><p:tr/></p:tbl>", .{ .max_rows = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl><p:tr><p:tc/></p:tr></p:tbl>", .{ .max_cells = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl><p:tr><p:tc/><p:tc/></p:tr></p:tbl>", .{ .max_cells = 1 }));
}

test "HWPX table child topology releases all allocations under failure injection" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            const report = try inspectXml(a, "<p:tbl rowCnt='1' colCnt='1'><p:tr x:flag='1'><p:tc x:other='2'><p:subList/><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/><p:cellSz width='1' height='1'/><p:cellMargin left='0' right='0' top='0' bottom='0'/></p:tc></p:tr></p:tbl>", .{});
            try std.testing.expectEqual(@as(usize, 1), report.table_child_topology.cell_first_known_sub_list);
            try std.testing.expectEqual(@as(usize, 1), report.table_child_topology.row_other_attributes);
        }
    }.run, .{});
}
