const std = @import("std");
const section_tree = @import("section_tree.zig");
const geometry = @import("table_geometry.zig");
const header_resources = @import("header_resources.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'>";

fn inspectXml(a: std.mem.Allocator, body: []const u8, options: geometry.Options, borders: ?*const header_resources.Table) !geometry.Report {
    const source = try std.fmt.allocPrint(a, "{s}{s}</s:sec>", .{ prefix, body });
    defer a.free(source);
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    return geometry.inspectWithBorderFills(a, &.{tree}, options, borders);
}

test "HWPX table children inspect direct margins zones and real header IDs" {
    const a = std.testing.allocator;
    var borders: header_resources.Table = .{ .present = true };
    defer borders.ids.deinit(a);
    try borders.ids.appendSlice(a, &.{ 0, 7 });
    const report = try inspectXml(a, "<p:tbl rowCnt='2' colCnt='3'>" ++
        "<p:inMargin left='-2' right='4294967295' top='0' bottom='&#49;2'/>" ++
        "<x:inMargin left='88'/>" ++
        "<p:cellzoneList><p:cellzone startRowAddr='0' startColAddr='0' endRowAddr='1' endColAddr='2' borderFillIDRef='7'/>" ++
        "<p:cellzone startRowAddr='1' startColAddr='2' endRowAddr='1' endColAddr='2' borderFillIDRef='0'/>" ++
        "<x:cellzone borderFillIDRef='88'/></p:cellzoneList>" ++
        "<p:tr/><p:tr/></p:tbl>", .{}, &borders);
    const children = report.table_children;
    try std.testing.expectEqual(@as(usize, 1), children.tables);
    try std.testing.expectEqual(@as(usize, 1), children.in_margins);
    try std.testing.expectEqualSlices(i64, &.{ -2, 4294967295, 0, 12 }, &children.margin_sum);
    try std.testing.expectEqualSlices(usize, &.{ 1, 0, 0, 0 }, &children.margin_negative);
    try std.testing.expectEqualSlices(usize, &.{ 0, 1, 0, 0 }, &children.margin_highbit);
    try std.testing.expectEqual(@as(usize, 1), children.margin_zero[2]);
    try std.testing.expectEqual(@as(usize, 1), children.zone_lists);
    try std.testing.expectEqual(@as(usize, 2), children.zones);
    try std.testing.expectEqual(@as(usize, 1), children.other_zone_list_children);
    try std.testing.expectEqualSlices(u64, &.{ 1, 2, 2, 4 }, &children.coordinate_sum);
    try std.testing.expectEqual(@as(usize, 0), children.inverted_zones);
    try std.testing.expectEqual(@as(usize, 0), children.outside_grid);
    try std.testing.expectEqual(@as(usize, 1), children.border_zero);
    try std.testing.expectEqual(@as(u64, 7), children.border_sum);
    try std.testing.expect(children.border_references_checked);
    try std.testing.expectEqual(@as(usize, 2), children.border_references.resolved);
    const standalone = try inspectXml(a, "<p:tbl><p:cellzoneList><p:cellzone borderFillIDRef='0'/></p:cellzoneList></p:tbl>", .{}, null);
    try std.testing.expect(!standalone.table_children.border_references_checked);
    try std.testing.expectEqual(@as(usize, 0), standalone.table_children.border_references.present);
    var high_id: header_resources.Table = .{ .present = true };
    defer high_id.ids.deinit(a);
    try high_id.ids.append(a, 4294967295);
    const high = try inspectXml(a, "<p:tbl rowCnt='1' colCnt='1'><p:cellzoneList><p:cellzone startRowAddr='4294967295' borderFillIDRef='4294967295'/></p:cellzoneList></p:tbl>", .{}, &high_id);
    try std.testing.expectEqual(@as(usize, 1), high.table_children.outside_grid);
    try std.testing.expectEqual(@as(u64, 4294967295), high.table_children.border_sum);
    try std.testing.expectEqual(@as(usize, 1), high.table_children.border_references.resolved);
}

test "HWPX table children preserve absent duplicate and partial fields" {
    const report = try inspectXml(std.testing.allocator, "<p:tbl rowCnt='2' colCnt='2'>" ++
        "<p:inMargin left='1'/><p:inMargin right='2'/>" ++
        "<p:cellzoneList><p:cellzone startRowAddr='2' endRowAddr='1' startColAddr='1' endColAddr='0' borderFillIDRef='0'/>" ++
        "<p:cellzone startRowAddr='3' x:endRowAddr='1' x:borderFillIDRef='9'/><x:cellzone/></p:cellzoneList>" ++
        "<p:cellzoneList/><p:tr/><p:tr/></p:tbl><p:tbl rowCnt='0' colCnt='0'/>", .{}, &.{});
    const children = report.table_children;
    try std.testing.expectEqual(@as(usize, 2), children.tables);
    try std.testing.expectEqual(@as(usize, 1), children.missing_in_margin);
    try std.testing.expectEqual(@as(usize, 1), children.duplicate_in_margin);
    try std.testing.expectEqualSlices(usize, &.{ 1, 1, 2, 2 }, &children.margin_missing);
    try std.testing.expectEqual(@as(usize, 1), children.missing_zone_list);
    try std.testing.expectEqual(@as(usize, 1), children.duplicate_zone_list);
    try std.testing.expectEqual(@as(usize, 1), children.empty_zone_lists);
    try std.testing.expectEqual(@as(usize, 2), children.zones);
    try std.testing.expectEqual(@as(usize, 1), children.other_zone_list_children);
    try std.testing.expectEqual(@as(usize, 1), children.inverted_zones);
    try std.testing.expectEqual(@as(usize, 2), children.outside_grid);
    try std.testing.expectEqual(@as(usize, 1), children.coordinate_absent[2]);
    try std.testing.expectEqual(@as(usize, 1), children.border_absent);
    try std.testing.expectEqual(@as(usize, 1), children.border_references.absent_table);
    try std.testing.expectEqual(@as(?u32, 0), children.border_references.first_unresolved_id);
}

test "HWPX table children reject bad known scalars and enforce all limits" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.InvalidSignedOrUnsigned32, inspectXml(a, "<p:tbl><p:inMargin left='-2147483649'/></p:tbl>", .{}, null));
    try std.testing.expectError(error.InvalidSignedOrUnsigned32, inspectXml(a, "<p:tbl><p:inMargin left='1'/><p:inMargin left='-2147483649'/></p:tbl>", .{}, null));
    try std.testing.expectError(error.InvalidUnsigned32, inspectXml(a, "<p:tbl><p:cellzoneList><p:cellzone startRowAddr='4294967296'/></p:cellzoneList></p:tbl>", .{}, null));
    try std.testing.expectError(error.InvalidNonNegativeInteger, inspectXml(a, "<p:tbl><p:cellzoneList><p:cellzone borderFillIDRef='-1'/></p:cellzoneList></p:tbl>", .{}, null));
    try std.testing.expectError(error.InvalidUnsigned32, inspectXml(a, "<p:tbl><p:cellzoneList><p:cellzone/><p:cellzone endColAddr='4294967296'/></p:cellzoneList></p:tbl>", .{}, null));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl><p:inMargin left='123'/></p:tbl>", .{ .max_attribute_bytes = 2 }, null));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl><p:inMargin/></p:tbl>", .{ .table_children = .{ .max_margin_elements = 0 } }, null));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl><p:cellzoneList/></p:tbl>", .{ .table_children = .{ .max_zone_lists = 0 } }, null));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl><p:cellzoneList><p:cellzone/></p:cellzoneList></p:tbl>", .{ .table_children = .{ .max_zones = 0 } }, null));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl><p:inMargin/></p:tbl><p:tbl><p:inMargin/></p:tbl>", .{ .table_children = .{ .max_margin_elements = 1 } }, null));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl><p:cellzoneList/></p:tbl><p:tbl><p:cellzoneList/></p:tbl>", .{ .table_children = .{ .max_zone_lists = 1 } }, null));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl><p:cellzoneList><p:cellzone/></p:cellzoneList></p:tbl><p:tbl><p:cellzoneList><p:cellzone/></p:cellzoneList></p:tbl>", .{ .table_children = .{ .max_zones = 1 } }, null));
}

test "HWPX table children release allocations at every failure point" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            const report = try inspectXml(a, "<p:tbl rowCnt='1' colCnt='1'><p:inMargin left='1' right='2' top='3' bottom='4'/><p:cellzoneList><p:cellzone startRowAddr='0' startColAddr='0' endRowAddr='0' endColAddr='0' borderFillIDRef='7'/></p:cellzoneList><p:tr/></p:tbl>", .{}, &.{});
            try std.testing.expectEqual(@as(usize, 1), report.table_children.zones);
            try std.testing.expectEqual(@as(usize, 1), report.table_children.border_references.absent_table);
        }
    }.run, .{});
}
