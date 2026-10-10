//! Exact computed-field classification, never edit permission or link validation.
const std = @import("std");
const fields = @import("field_markers.zig");

pub fn isBegin(marker: fields.Marker) bool {
    if (marker.kind != .begin) return false;
    const begin = marker.begin orelse return false;
    return std.mem.eql(u8, begin.type_raw orelse "", "FORMULA");
}

pub fn owned(report: *const fields.Report, section: usize, positions: []const @import("field_position.zig").Position) bool {
    for (positions) |position| for (report.markers) |marker| {
        if (marker.section_ordinal == section and marker.element_index == position.begin_element and isBegin(marker)) return true;
    };
    return false;
}

test "computed marker classification is exact and grants no text field permission" {
    var marker: fields.Marker = .{ .section_ordinal = 0, .element_index = 1, .parent_element_index = 0, .parent_uri = "", .parent_local_name = "ctrl", .kind = .begin, .raw_xml = "" };
    try std.testing.expect(!isBegin(marker));
    marker.begin = .{ .type_raw = "FORMULA", .editable = false };
    try std.testing.expect(isBegin(marker));
    try std.testing.expect(!@import("field_text_kind.zig").supported(marker.begin.?.type_raw.?));
    marker.kind = .end;
    try std.testing.expect(!isBegin(marker));
    marker.kind = .begin;
    for ([_]?[]const u8{ null, "", "formula", "FORMULA ", "FORMULA\x00", "HYPERLINK", "CLICK_HERE" }) |kind| {
        marker.begin.?.type_raw = kind;
        try std.testing.expect(!isBegin(marker));
    }
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:fieldBegin id='1' type='FORMULA'/><p:fieldEnd beginIDRef='1'/><p:fieldBegin id='2' type='HYPERLINK'/><p:fieldEnd beginIDRef='2'/></p:ctrl></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var report = try fields.inspect(a, &.{tree}, .{});
    defer report.deinit();
    const position: @import("field_position.zig").Position = .{ .element_index = report.markers[1].element_index, .begin_element = report.markers[0].element_index, .kind = .end, .unit = 0 };
    try std.testing.expect(owned(&report, 0, &.{position}));
    try std.testing.expect(!owned(&report, 1, &.{position}));
    var other = position;
    other.begin_element = report.markers[2].element_index;
    try std.testing.expect(!owned(&report, 0, &.{other}));
    other.begin_element = std.math.maxInt(usize);
    try std.testing.expect(!owned(&report, 0, &.{other}));
}
