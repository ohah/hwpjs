const std = @import("std");
const section_tree = @import("section_tree.zig");
const header_tree = @import("header_tree.zig");
const children = @import("paragraph_children.zig");

fn inspectXml(a: std.mem.Allocator, body: []const u8, options: children.Options) !children.Report {
    const source = try std.fmt.allocPrint(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'>{s}</s:sec>", .{body});
    defer a.free(source);
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    return children.inspect(&.{tree}, options);
}

test "HWPX paragraph children distinguish direct model names and foreign aliases" {
    const report = try inspectXml(std.testing.allocator, "<p:p><p:run/><p:linesegarray/><p:linesegarray/><x:run/><p:other><p:run/></p:other></p:p>" ++
        "<p:p><x:linesegarray/></p:p>", .{});
    try std.testing.expectEqual(@as(usize, 1), report.sections);
    try std.testing.expectEqual(@as(usize, 2), report.paragraphs);
    try std.testing.expectEqual(@as(usize, 1), report.direct_runs);
    try std.testing.expectEqual(@as(usize, 2), report.line_seg_arrays);
    try std.testing.expectEqual(@as(usize, 1), report.paragraphs_without_run);
    try std.testing.expectEqual(@as(usize, 1), report.paragraphs_without_line_seg_array);
    try std.testing.expectEqual(@as(usize, 1), report.paragraphs_with_multiple_line_seg_arrays);
    try std.testing.expectEqual(@as(usize, 3), report.other_direct);
    try std.testing.expectEqual(@as(usize, 2), report.foreign_direct);
}

test "HWPX paragraph children include cell subList paragraphs without counting grandchildren as direct" {
    const report = try inspectXml(std.testing.allocator, "<p:p><p:run><p:tbl><p:tr><p:tc><p:subList><p:p><p:run/><p:linesegarray/></p:p></p:subList></p:tc></p:tr></p:tbl></p:run></p:p>", .{});
    try std.testing.expectEqual(@as(usize, 2), report.paragraphs);
    try std.testing.expectEqual(@as(usize, 2), report.direct_runs);
    try std.testing.expectEqual(@as(usize, 1), report.line_seg_arrays);
    try std.testing.expectEqual(@as(usize, 1), report.paragraphs_without_line_seg_array);
    try std.testing.expectEqual(@as(usize, 0), report.other_direct);
}

test "HWPX paragraph children enforce exact budgets and part kind" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:p/>", .{ .max_paragraphs = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:p><p:run/></p:p>", .{ .max_direct_children = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:p><p:run/><p:linesegarray/></p:p>", .{ .max_direct_children = 1 }));
    const exact = try inspectXml(a, "<p:p><p:run/><p:linesegarray/></p:p>", .{ .max_paragraphs = 1, .max_direct_children = 2 });
    try std.testing.expectEqual(@as(usize, 1), exact.paragraphs);
    var header = try header_tree.parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'/>", 0, .{});
    defer header.deinit(a);
    try std.testing.expectError(error.InvalidPartKind, children.inspect(&.{header}, .{}));
}
