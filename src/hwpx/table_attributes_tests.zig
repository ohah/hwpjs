const std = @import("std");
const section_tree = @import("section_tree.zig");
const geometry = @import("table_geometry.zig");
const header_resources = @import("header_resources.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'>";

fn inspectXml(a: std.mem.Allocator, body: []const u8, options: geometry.Options, border_fills: ?*const header_resources.Table) !geometry.Report {
    const source = try std.fmt.allocPrint(a, "{s}{s}</s:sec>", .{ prefix, body });
    defer a.free(source);
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    return geometry.inspectWithBorderFills(a, &.{tree}, options, border_fills);
}

test "HWPX table attributes preserve enums booleans numbers and absence" {
    const report = try inspectXml(std.testing.allocator, "<p:tbl pageBreak='NONE' repeatHeader='true' noAdjust='0' cellSpacing='&#49;2' borderFillIDRef='4294967295'/>" ++
        "<p:tbl pageBreak='TABLE' repeatHeader='0' noAdjust='1' cellSpacing='0' borderFillIDRef='0'/>" ++
        "<p:tbl pageBreak='CELL'/>" ++
        "<p:tbl pageBreak='FUTURE'/>" ++
        "<p:tbl x:pageBreak='NONE' x:repeatHeader='1' x:noAdjust='1' x:cellSpacing='3' x:borderFillIDRef='3'/>", .{}, null);
    const attrs = report.table_attributes;
    try std.testing.expectEqual(@as(usize, 5), attrs.tables);
    try std.testing.expectEqual(@as(usize, 1), attrs.page_break.none);
    try std.testing.expectEqual(@as(usize, 1), attrs.page_break.table);
    try std.testing.expectEqual(@as(usize, 1), attrs.page_break.cell);
    try std.testing.expectEqual(@as(usize, 1), attrs.page_break.unknown);
    try std.testing.expectEqual(@as(usize, 1), attrs.page_break.absent);
    try std.testing.expectEqual(@as(usize, 1), attrs.repeat_header.true_value);
    try std.testing.expectEqual(@as(usize, 1), attrs.repeat_header.false_value);
    try std.testing.expectEqual(@as(usize, 3), attrs.repeat_header.absent);
    try std.testing.expectEqual(@as(usize, 1), attrs.no_adjust.true_value);
    try std.testing.expectEqual(@as(usize, 1), attrs.no_adjust.false_value);
    try std.testing.expectEqual(@as(usize, 3), attrs.cell_spacing_absent);
    try std.testing.expectEqual(@as(usize, 1), attrs.cell_spacing_zero);
    try std.testing.expectEqual(@as(u64, 12), attrs.cell_spacing_sum);
    try std.testing.expectEqual(@as(usize, 3), attrs.border_fill_absent);
    try std.testing.expectEqual(@as(usize, 1), attrs.border_fill_zero);
    try std.testing.expectEqual(@as(u64, 4294967295), attrs.border_fill_sum);
    try std.testing.expect(!attrs.border_fill_references_checked);
}

test "HWPX table attributes resolve zero only when header has zero" {
    const a = std.testing.allocator;
    var inventory: header_resources.Table = .{ .present = true };
    defer inventory.ids.deinit(a);
    try inventory.ids.appendSlice(a, &.{ 7, 9 });
    const body = "<p:tbl borderFillIDRef='7'/><p:tbl borderFillIDRef='0'/><p:tbl x:borderFillIDRef='9'/>";
    const report = try inspectXml(a, body, .{}, &inventory);
    const refs = report.table_attributes.border_fill_references;
    try std.testing.expect(report.table_attributes.border_fill_references_checked);
    try std.testing.expectEqual(@as(usize, 2), refs.present);
    try std.testing.expectEqual(@as(usize, 1), refs.absent);
    try std.testing.expectEqual(@as(usize, 1), refs.resolved);
    try std.testing.expectEqual(@as(usize, 1), refs.missing_target);
    try std.testing.expectEqual(@as(?u32, 0), refs.first_unresolved_id);
    try std.testing.expectEqual(@as(?usize, 0), refs.first_unresolved_item_index);
    const absent_table = try inspectXml(a, body, .{}, &.{});
    try std.testing.expectEqual(@as(usize, 2), absent_table.table_attributes.border_fill_references.absent_table);
    inventory.ids.clearRetainingCapacity();
    try inventory.ids.appendSlice(a, &.{ 0, 7, 9 });
    const zero_present = try inspectXml(a, body, .{}, &inventory);
    try std.testing.expectEqual(@as(usize, 2), zero_present.table_attributes.border_fill_references.resolved);
}

test "HWPX table attributes reject malformed known values and enforce limits" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.InvalidXmlBoolean, inspectXml(a, "<p:tbl repeatHeader='TRUE'/>", .{}, null));
    try std.testing.expectError(error.InvalidXmlBoolean, inspectXml(a, "<p:tbl noAdjust='yes'/>", .{}, null));
    try std.testing.expectError(error.InvalidNonNegativeInteger, inspectXml(a, "<p:tbl cellSpacing='-1'/>", .{}, null));
    try std.testing.expectError(error.InvalidUnsigned32, inspectXml(a, "<p:tbl borderFillIDRef='4294967296'/>", .{}, null));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl pageBreak='TABLE'/>", .{ .max_attribute_bytes = 2 }, null));
}

test "HWPX table attributes release all allocations under failure injection" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            const report = try inspectXml(a, "<p:tbl pageBreak='C&#69;LL' repeatHeader='1' noAdjust='false' cellSpacing='12' borderFillIDRef='0'/>", .{}, &.{});
            try std.testing.expectEqual(@as(usize, 1), report.table_attributes.page_break.cell);
            try std.testing.expectEqual(@as(usize, 1), report.table_attributes.border_fill_references.absent_table);
        }
    }.run, .{});
}
