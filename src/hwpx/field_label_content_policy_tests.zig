const std = @import("std");
const policy = @import("field_label_content_policy.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("field_markers.zig");
const ranges_mod = @import("field_text_ranges.zig");
const a = std.testing.allocator;
const ns = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:f='urn:foreign'>";
const begin = "<p:ctrl><p:fieldBegin id='1' type='CLICK_HERE'/></p:ctrl>";
const end = "<p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl>";
const Fixture = struct {
    raw: []u8,
    tree: Tree,
    report: fields.Report,
    ranges: []ranges_mod.Range,
    fn deinit(self: *@This()) void {
        a.free(self.ranges);
        self.report.deinit();
        self.tree.deinit(a);
        a.free(self.raw);
    }
};
fn make(content: []const u8) !Fixture {
    const raw = try std.mem.concat(a, u8, &.{ ns, "<p:p><p:run>", begin, content, end, "</p:run></p:p></s:sec>" });
    errdefer a.free(raw);
    var tree = try @import("xml_part_tree.zig").parse(a, raw, .section, 0, 0, .{});
    errdefer tree.deinit(a);
    var report = try fields.inspect(a, &.{tree}, .{});
    errdefer report.deinit();
    const ranges = try ranges_mod.build(a, &.{tree}, &report);
    return .{ .raw = raw, .tree = tree, .report = report, .ranges = ranges };
}
fn find(f: *Fixture, uri: []const u8, local: []const u8) usize {
    for (f.tree.elements, 0..) |e, i| if (e.is(uri, local)) return i;
    unreachable;
}
const p_uri = @import("document_xml.zig").paragraph_uri;

test "content policy v2 whitelist and inline unit order are unchanged" {
    var f = try make("<p:t>A<p:tab/><p:nbSpace/><p:fwSpace/><p:lineBreak/><p:hypen/>B</p:t><p:ctrl/><p:linesegarray><p:lineseg/></p:linesegarray>");
    defer f.deinit();
    for ([_]bool{ false, true }) |nested| try std.testing.expectEqual(@as(?usize, null), try policy.firstUnsupportedNode(&f.tree, f.ranges[0], f.ranges, &f.report, nested));
    var bad = try make("<p:t>A<p:lineBreak>hidden</p:lineBreak></p:t><p:tbl/>");
    defer bad.deinit();
    try std.testing.expectEqual(@as(?usize, find(&bad, p_uri, "lineBreak")), try policy.firstUnsupportedNode(&bad.tree, bad.ranges[0], bad.ranges, &bad.report, false));
}

test "content policy v2 QName interval and first unsupported source order" {
    var f = try make("<p:t>A</p:t><f:run/><p:tbl/><p:rect/>");
    defer f.deinit();
    const foreign = find(&f, "urn:foreign", "run");
    const table = find(&f, p_uri, "tbl");
    const rect = find(&f, p_uri, "rect");
    try std.testing.expectEqual(@as(?usize, foreign), try policy.firstUnsupportedNode(&f.tree, f.ranges[0], f.ranges, &f.report, false));
    var narrowed = f.ranges[0];
    narrowed.content_start = f.tree.elements[table].start_tag.start;
    try std.testing.expectEqual(@as(?usize, table), try policy.firstUnsupportedNode(&f.tree, narrowed, f.ranges, &f.report, false));
    narrowed.content_start = f.tree.elements[table].end;
    try std.testing.expectEqual(@as(?usize, rect), try policy.firstUnsupportedNode(&f.tree, narrowed, f.ranges, &f.report, false));
    narrowed.content_end = narrowed.content_start;
    try std.testing.expectEqual(@as(?usize, null), try policy.firstUnsupportedNode(&f.tree, narrowed, f.ranges, &f.report, true));
}

fn nestedContent(kind: []const u8, table_first: bool) ![]u8 {
    return std.fmt.allocPrint(a, "{s}<p:ctrl><p:fieldBegin id='2' type='{s}'><p:parameters><p:stringParam name='Command'>opaque</p:stringParam></p:parameters></p:fieldBegin></p:ctrl><p:t>child</p:t><p:ctrl><p:fieldEnd beginIDRef='2'/></p:ctrl>{s}", .{ if (table_first) "<p:tbl/>" else "", kind, if (table_first) "" else "<p:tbl/>" });
}

test "content policy v2 allow nested retains only validated marker metadata subtrees" {
    const content = try nestedContent("CLICK_HERE", false);
    defer a.free(content);
    var f = try make(content);
    defer f.deinit();
    const inner = f.report.markers[f.ranges[1].begin_marker].element_index;
    const table = find(&f, p_uri, "tbl");
    try std.testing.expectEqual(@as(?usize, inner), try policy.firstUnsupportedNode(&f.tree, f.ranges[0], f.ranges, &f.report, false));
    try std.testing.expectEqual(@as(?usize, table), try policy.firstUnsupportedNode(&f.tree, f.ranges[0], f.ranges, &f.report, true));
}

test "content policy v2 descendant errors retain priority over unsupported table result" {
    const content = try nestedContent("UNKNOWN", true);
    defer a.free(content);
    var f = try make(content);
    defer f.deinit();
    const table = find(&f, p_uri, "tbl");
    // false never invokes retainedDescendantMarker; true must not swallow its
    // existing unknown-kind error even when a table appears before the marker.
    try std.testing.expectEqual(@as(?usize, table), try policy.firstUnsupportedNode(&f.tree, f.ranges[0], f.ranges, &f.report, false));
    try std.testing.expectError(error.UnsupportedNestedFieldLabel, policy.firstUnsupportedNode(&f.tree, f.ranges[0], f.ranges, &f.report, true));
}

test "content policy v2 relation errors and empty interval keep traversal priority" {
    const content = try nestedContent("CLICK_HERE", true);
    defer a.free(content);
    var f = try make(content);
    defer f.deinit();
    var changed = try a.dupe(ranges_mod.Range, f.ranges);
    defer a.free(changed);
    changed[1].content_end = changed[1].content_start - 1;
    const table = find(&f, p_uri, "tbl");
    try std.testing.expectEqual(@as(?usize, table), try policy.firstUnsupportedNode(&f.tree, changed[0], changed, &f.report, false));
    try std.testing.expectError(error.InvalidFieldSpan, policy.firstUnsupportedNode(&f.tree, changed[0], changed, &f.report, true));
    // Whitelisted/retained inline nodes short-circuit descendant inspection,
    // including when unrelated range metadata is invalid.
    var allowed = try make("<p:t>A<p:tab/><p:lineBreak/>B</p:t>");
    defer allowed.deinit();
    const with_bad = [_]ranges_mod.Range{ allowed.ranges[0], changed[1] };
    try std.testing.expectEqual(@as(?usize, null), try policy.firstUnsupportedNode(&allowed.tree, allowed.ranges[0], &with_bad, &allowed.report, true));
    var empty = changed[0];
    empty.content_end = empty.content_start;
    try std.testing.expectEqual(@as(?usize, null), try policy.firstUnsupportedNode(&f.tree, empty, changed, &f.report, true));
}
