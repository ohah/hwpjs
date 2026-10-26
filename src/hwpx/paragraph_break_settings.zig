//! Source paragraph break booleans, preserving absence independently of false.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
pub const Values = struct {
    widow_orphan: ?bool = null,
    keep_with_next: ?bool = null,
    keep_lines: ?bool = null,
    page_break_before: ?bool = null,
};
pub fn read(a: std.mem.Allocator, tree: *const Tree, parent: usize) !?Values {
    const node = try @import("paragraph_display_children.zig").child(a, tree, parent, @import("document_xml.zig").head_uri, "breakSetting") orelse return null;
    var result: Values = .{};
    inline for (.{ .{ "widowOrphan", "widow_orphan" }, .{ "keepWithNext", "keep_with_next" }, .{ "keepLines", "keep_lines" }, .{ "pageBreakBefore", "page_break_before" } }) |pair| {
        if (try tree.attributeValue(a, node, "", pair[0])) |raw| @field(result, pair[1]) = try @import("table_xml_fields.zig").boolean(a, raw, 4096);
    }
    return result;
}
test "paragraph break booleans preserve absent false true namespace and duplicate semantics" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:f='urn:foreign'><h:paraPr/><h:paraPr><h:breakSetting keepWithNext='0' keepLines='true' widowOrphan='&#49;' f:pageBreakBefore='1'/></h:paraPr><h:paraPr><f:breakSetting keepLines='1'/></h:paraPr><h:paraPr><h:breakSetting/><h:breakSetting/></h:paraPr><h:paraPr><h:breakSetting keepLines='2'/></h:paraPr></h:head>", .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.expect((try read(a, &tree, 1)) == null);
    const value = (try read(a, &tree, 2)).?;
    try std.testing.expectEqual(@as(?bool, false), value.keep_with_next);
    try std.testing.expectEqual(@as(?bool, true), value.keep_lines);
    try std.testing.expectEqual(@as(?bool, true), value.widow_orphan);
    try std.testing.expect(value.page_break_before == null);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: *const Tree) !void {
            const actual = (try read(allocator, input, 2)).?;
            try std.testing.expectEqual(@as(?bool, true), actual.widow_orphan);
        }
    }.run, .{&tree});
    try std.testing.expect((try read(a, &tree, 4)) == null);
    try std.testing.expectError(error.DuplicateParagraphDisplayChild, read(a, &tree, 6));
    try std.testing.expectError(error.InvalidXmlBoolean, read(a, &tree, 9));
}
