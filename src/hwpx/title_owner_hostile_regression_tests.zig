//! 미실행 Session 회귀 후보. 새 owner ledger 경로만 검사합니다.
const std = @import("std");
const editor = @import("editor_session.zig");
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='1'>";
const suffix = "</p:run></p:p></s:sec>";
const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList><h:charProperties itemCnt='2'><h:charPr id='1' height='1000'/><h:charPr id='2' height='1200'/></h:charProperties></h:refList></h:head>";
fn input(a: std.mem.Allocator, body: []const u8) ![]u8 {
    const section = try std.mem.concat(a, u8, &.{ prefix, body, suffix });
    defer a.free(section);
    return @import("test_formula_fixture.zig").zipWithSectionHeader(a, section, header);
}

test "title owner capture retains existing typed tab style path" {
    const a = std.testing.allocator;
    const bytes = try input(a, "<p:t>B<p:tab/>C<p:titleMark ignore='1'/>D</p:t>");
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    try std.testing.expect(try s.setCharacterFormat(0, 1, 0, 1, 2));
    const saved = try s.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, reopened.sections[0].tree.source, "<p:titleMark"));
    try std.testing.expectEqualSlices(u8, bytes, s.source);
}

test "insert into empty title owner then format inserted text updates nonempty owner" {
    const a = std.testing.allocator;
    const bytes = try input(a, "<p:t><p:titleMark ignore='1'/>BC</p:t>");
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    try std.testing.expect(try s.setCharacterFormat(0, 1, 0, 1, 2));
    try std.testing.expect(try s.splice(0, 1, 0, 0, "Y"));
    try std.testing.expect(try s.setCharacterFormat(0, 1, 0, 1, 2));
    const row = &s.sections[0].structure_values.?.paragraphs[0];
    try std.testing.expectEqual(@as(usize, 1), row.title_fragment_owners.?.len);
    try std.testing.expectEqual(@as(?u32, 2), row.title_fragment_owners.?[0].char_shape_id);
    const saved = try s.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const tree = &reopened.sections[0].tree;
    var checked: usize = 0;
    for (tree.elements) |node| {
        if (!node.is(@import("document_xml.zig").paragraph_uri, "titleMark")) continue;
        const run = tree.elements[node.parent.?].parent.?;
        try std.testing.expectEqual(@as(?u32, 2), try @import("character_style_projection.zig").runId(a, tree, run));
        checked += 1;
    }
    try std.testing.expectEqual(@as(usize, 1), checked);
}
