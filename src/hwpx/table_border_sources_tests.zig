const std = @import("std");
const t = std.testing;
const sources = @import("table_border_sources.zig");
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
test "table border sources share style identity preserve absence and clean up all failures" {
    var section = try @import("section_tree.zig").parse(t.allocator, prefix ++ "<p:tbl><p:tr><p:tc borderFillIDRef='4'><p:subList/></p:tc><p:tc borderFillIDRef='4'><p:subList/></p:tc><p:tc><p:subList/></p:tc></p:tr></p:tbl></s:sec>", 0, 0, .{});
    defer section.deinit(t.allocator);
    var header = try @import("header_tree.zig").parse(t.allocator, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:borderFills><h:borderFill id='4'><h:leftBorder type='NONE'/></h:borderFill></h:borderFills></h:refList></h:head>", 0, .{});
    defer header.deinit(t.allocator);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator, body: *@import("section_tree.zig").Tree, head: *@import("header_tree.zig").Tree) !void {
            var report = try sources.readTrees(a, body, head);
            defer report.deinit(a);
            try t.expectEqual(@as(usize, 3), report.cells.len);
            try t.expectEqual(@as(usize, 1), report.styles.len);
            try t.expectEqual(@as(?usize, 0), report.cells[0].style_index);
            try t.expectEqual(report.cells[0].style_index, report.cells[1].style_index);
            try t.expect(report.cells[2].border_fill_id == null and report.cells[2].style_index == null);
            try t.expect(report.cells[0].list_node != report.cells[1].list_node);
            const encoded = try std.json.Stringify.valueAlloc(a, report, .{});
            defer a.free(encoded);
            try t.expect(std.mem.indexOf(u8, encoded, "arena") == null);
            try t.expect(std.mem.indexOf(u8, encoded, "NONE") != null);
        }
    }.run, .{ &section, &header });
}
test "table border sources reject detached duplicate-list and missing-style cells" {
    var header = try @import("header_tree.zig").parse(t.allocator, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:borderFills><h:borderFill id='0'/></h:borderFills></h:refList></h:head>", 0, .{});
    defer header.deinit(t.allocator);
    inline for (.{
        .{ "<p:tc><p:subList/></p:tc>", error.InvalidTableBorderCell },
        .{ "<p:tbl><p:tr><p:tc/></p:tr></p:tbl>", error.InvalidTableBorderCell },
        .{ "<p:tbl><p:tr><p:tc><p:subList/><p:subList/></p:tc></p:tr></p:tbl>", error.InvalidTableBorderCell },
        .{ "<p:tbl><p:tr><p:tc borderFillIDRef='7'><p:subList/></p:tc></p:tr></p:tbl>", error.MissingBorderFillId },
    }) |case| {
        var section = try @import("section_tree.zig").parse(t.allocator, prefix ++ case[0] ++ "</s:sec>", 0, 0, .{});
        defer section.deinit(t.allocator);
        try t.expectError(case[1], sources.readTrees(t.allocator, &section, &header));
    }
    var zero = try @import("section_tree.zig").parse(t.allocator, prefix ++ "<p:tbl><p:tr><p:tc borderFillIDRef='0'><p:subList/></p:tc></p:tr></p:tbl></s:sec>", 0, 0, .{});
    defer zero.deinit(t.allocator);
    var report = try sources.readTrees(t.allocator, &zero, &header);
    defer report.deinit(t.allocator);
    try t.expectEqual(@as(?u32, 0), report.cells[0].border_fill_id);
    try t.expectEqual(@as(?usize, 0), report.cells[0].style_index);
}
