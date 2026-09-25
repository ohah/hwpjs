const std = @import("std");
const section_tree = @import("section_tree.zig");
const header_tree = @import("header_tree.zig");
const geometry = @import("page_geometry.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const suffix = "</s:sec>";

fn read(a: std.mem.Allocator, bytes: []const u8, options: geometry.Options) !geometry.Report {
    var section = try section_tree.parse(a, bytes, 0, 0, .{});
    defer section.deinit(a);
    return geometry.inspect(a, &.{section}, options);
}

test "HWPX page geometry reads every section definition and preserves absence" {
    const a = std.testing.allocator;
    var report = try read(a, prefix ++
        "<p:p><p:run><p:secPr><p:pagePr landscape='WIDELY' width='59528' height='84186' gutterType='LEFT_RIGHT'><p:margin header='4252' footer='4252' gutter='0' left='8504' right='8504' top='5668' bottom='4252'/></p:pagePr></p:secPr></p:run></p:p>" ++
        "<p:p><p:run><p:secPr><p:pagePr landscape='NARROWLY' width='&#52;0'><p:margin left='0'/></p:pagePr></p:secPr></p:run></p:p>" ++ suffix, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), report.pages.len);
    try std.testing.expectEqual(@as(usize, 0), report.sections_without_page);
    try std.testing.expectEqual(geometry.Orientation.widely, report.pages[0].orientation.?);
    try std.testing.expectEqual(geometry.GutterType.left_right, report.pages[0].gutter_type.?);
    try std.testing.expectEqual(@as(?u32, 59528), report.pages[0].width);
    try std.testing.expectEqual(@as(?u32, 4252), report.pages[0].margin.?.header);
    try std.testing.expectEqual(geometry.Orientation.narrowly, report.pages[1].orientation.?);
    try std.testing.expectEqual(@as(?u32, 40), report.pages[1].width);
    try std.testing.expectEqual(@as(?u32, null), report.pages[1].height);
    try std.testing.expectEqual(@as(?u32, null), report.pages[1].margin.?.header);
}

test "HWPX page geometry does not adopt unrelated nested or foreign pagePr" {
    const a = std.testing.allocator;
    var report = try read(a, prefix ++ "<p:pagePr width='1'/><p:secPr><x:pagePr xmlns:x='urn:x' width='2'/><p:other><p:pagePr width='3'/></p:other><p:pagePr width='4'><p:margin left='1'/><p:margin left='2'/></p:pagePr></p:secPr>" ++ suffix, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.pages.len);
    try std.testing.expectEqual(@as(?u32, 4), report.pages[0].width);
    try std.testing.expectEqual(@as(?u32, 1), report.pages[0].margin.?.left);
    try std.testing.expectEqual(@as(usize, 1), report.pages[0].duplicate_margins);
    var absent = try read(a, prefix ++ suffix, .{});
    defer absent.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), absent.sections_without_page);
}

test "HWPX page geometry rejects invalid scalars and enforces bounds" {
    const a = std.testing.allocator;
    const begin = prefix ++ "<p:secPr><p:pagePr ";
    const end = "/></p:secPr>" ++ suffix;
    try std.testing.expectError(error.InvalidPageOrientation, read(a, begin ++ "landscape='SIDEWAYS'" ++ end, .{}));
    try std.testing.expectError(error.InvalidPageGutterType, read(a, begin ++ "gutterType='LEFT'" ++ end, .{}));
    var whitespace = try read(a, begin ++ "landscape=' WIDELY&#10;' gutterType='&#9;TOP_BOTTOM '" ++ end, .{});
    defer whitespace.deinit(a);
    try std.testing.expectEqual(geometry.Orientation.widely, whitespace.pages[0].orientation.?);
    try std.testing.expectEqual(geometry.GutterType.top_bottom, whitespace.pages[0].gutter_type.?);
    try std.testing.expectError(error.InvalidUnsigned32, read(a, begin ++ "width='4294967296'" ++ end, .{}));
    try std.testing.expectError(error.InvalidNonNegativeInteger, read(a, begin ++ "height='-1'" ++ end, .{}));
    try std.testing.expectError(error.LimitExceeded, read(a, begin ++ "width='12'" ++ end, .{ .max_attribute_bytes = 1 }));
    try std.testing.expectError(error.LimitExceeded, read(a, begin ++ "width='12'" ++ end, .{ .max_pages = 0 }));
    var exact = try read(a, begin ++ "width='12'" ++ end, .{ .max_attribute_bytes = 2, .max_pages = 1 });
    exact.deinit(a);
}

test "HWPX page geometry frees partial reports on allocation failure" {
    const source = prefix ++ "<p:secPr><p:pagePr width='123' height='456'><p:margin left='1' right='2'/></p:pagePr><p:pagePr landscape='WIDELY' gutterType='TOP_BOTTOM'/></p:secPr>" ++ suffix;
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, bytes: []const u8) !void {
            var report = try read(a, bytes, .{});
            defer report.deinit(a);
            try std.testing.expectEqual(@as(usize, 2), report.pages.len);
        }
    }.run, .{source});
}

test "HWPX page geometry enforces part order and global page budget" {
    const a = std.testing.allocator;
    var first = try section_tree.parse(a, prefix ++ "<p:secPr><p:pagePr width='1'/></p:secPr>" ++ suffix, 0, 0, .{});
    defer first.deinit(a);
    var second = try section_tree.parse(a, prefix ++ "<p:secPr><p:pagePr width='2'/></p:secPr>" ++ suffix, 1, 1, .{});
    defer second.deinit(a);
    try std.testing.expectError(error.LimitExceeded, geometry.inspect(a, &.{ first, second }, .{ .max_pages = 1 }));
    var report = try geometry.inspect(a, &.{ first, second }, .{ .max_pages = 2 });
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), report.sections);
    try std.testing.expectEqual(@as(usize, 1), report.pages[1].section_ordinal);
    try std.testing.expectEqual(@as(?u32, 2), report.pages[1].width);
    try std.testing.expectError(error.InvalidPartKind, geometry.inspect(a, &.{second}, .{}));
    var header = try header_tree.parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'/>", 0, .{});
    defer header.deinit(a);
    try std.testing.expectError(error.InvalidPartKind, geometry.inspect(a, &.{header}, .{}));
}
