const std = @import("std");
const section_tree = @import("section_tree.zig");
const borders = @import("section_page_border.zig");
const resources = @import("header_resources.zig");
const refs = @import("section_page_border_refs.zig");
const package = @import("package.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const suffix = "</s:sec>";

test "HWPX page border references resolve zero only when it is a real table ID" {
    const a = std.testing.allocator;
    var tree = try section_tree.parse(a, prefix ++
        "<p:secPr><p:pageBorderFill/><p:pageBorderFill borderFillIDRef='0'/><p:pageBorderFill borderFillIDRef='+7'/><p:pageBorderFill borderFillIDRef='8'/></p:secPr>" ++ suffix, 0, 0, .{});
    defer tree.deinit(a);
    var border_report = try borders.inspect(a, &.{tree}, .{});
    defer border_report.deinit(a);
    var table: resources.Table = .{ .present = true };
    defer table.ids.deinit(a);
    try table.ids.appendSlice(a, &.{ 0, 7 });
    const report = try refs.inspect(&border_report, &table);
    try std.testing.expectEqual(@as(usize, 4), report.borders);
    try std.testing.expectEqual(@as(usize, 1), report.absent);
    try std.testing.expectEqual(@as(usize, 1), report.zero);
    try std.testing.expectEqual(@as(usize, 2), report.resolved);
    try std.testing.expectEqual(@as(usize, 1), report.missing_target);
    try std.testing.expectEqual(@as(?u32, 8), report.first_unresolved_id);
    try std.testing.expectEqual(@as(?usize, 0), report.first_unresolved_section);
    try std.testing.expectEqual(@as(?usize, border_report.items[3].element_index), report.first_unresolved_element);

    table.present = false;
    const absent = try refs.inspect(&border_report, &table);
    try std.testing.expectEqual(@as(usize, 3), absent.absent_table);
    try std.testing.expectEqual(@as(usize, 1), absent.zero);
    try std.testing.expectEqual(@as(?u32, 0), absent.first_unresolved_id);
    try std.testing.expectEqual(@as(?usize, border_report.items[1].element_index), absent.first_unresolved_element);

    var no_zero: resources.Table = .{ .present = true };
    defer no_zero.ids.deinit(a);
    try no_zero.ids.append(a, 7);
    const missing_zero = try refs.inspect(&border_report, &no_zero);
    try std.testing.expectEqual(@as(usize, 1), missing_zero.resolved);
    try std.testing.expectEqual(@as(usize, 2), missing_zero.missing_target);
    try std.testing.expectEqual(@as(?u32, 0), missing_zero.first_unresolved_id);
}

test "HWPX page border references diagnose real zero IDs without a target" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpx/issue2019_floating_form_74312.hwpx", a, .limited(1_000_000));
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var trees = try document.readXmlTrees(a, .{});
    defer trees.deinit(a);
    var border_report = try trees.inspectSectionPageBorders(a, .{});
    defer border_report.deinit(a);
    var resource_report = try document.inspectHeaderResources(a, .{});
    defer resource_report.deinit(a);
    try std.testing.expect(!resource_report.table(.border_fill).hasId(0));
    const report = try refs.inspect(&border_report, resource_report.table(.border_fill));
    try std.testing.expectEqual(@as(usize, 30), report.borders);
    try std.testing.expectEqual(@as(usize, 30), report.zero);
    try std.testing.expectEqual(@as(usize, 30), report.missing_target);
    try std.testing.expectEqual(@as(usize, 0), report.resolved);
    try std.testing.expectEqual(@as(?u32, 0), report.first_unresolved_id);
}
