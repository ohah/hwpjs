//! 실제 Session 공개 서식/저장 경로. 직접 Paragraph/Span을 주입하지 않습니다.
const std = @import("std");
const editor = @import("editor_session.zig");
const head = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList><h:charProperties itemCnt='2'><h:charPr id='1' height='1000'/><h:charPr id='2' height='1200'/></h:charProperties></h:refList></h:head>";
const marker = "<p:titleMark ignore='1'/>";

fn exercise(leading: bool, whole: bool) !void {
    const a = std.testing.allocator;
    const text = if (leading) marker ++ "BC" else "BC" ++ marker;
    const section = try std.mem.concat(a, u8, &.{ head, "<p:p><p:run charPrIDRef='1'><p:t>", text, "</p:t></p:run></p:p></s:sec>" });
    defer a.free(section);
    const input = try @import("test_formula_fixture.zig").zipWithSectionHeader(a, section, header);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(session.sections[0].structure_values == null);
    try std.testing.expectEqual(@as(usize, 2), session.sections[0].sites.items.len);
    const zero = session.sections[0].sites.items[if (leading) 0 else 1];
    try std.testing.expectEqual(@as(usize, 0), zero.text.len);
    try std.testing.expectEqual(zero.start, zero.end);
    try std.testing.expect(!zero.empty_element and !zero.missing_text and !zero.anchor_boundary);
    try std.testing.expect(try session.setCharacterFormat(0, 1, 0, if (whole) 2 else 1, 2));
    const row = &session.sections[0].structure_values.?.paragraphs[0];
    try std.testing.expect(row.field_positions == null);
    try std.testing.expect(row.title_positions == null);
    try std.testing.expectEqual(@as(?u32, 1), row.character_styles.?[if (leading) 0 else row.character_styles.?.len - 1].char_shape_id);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const body = if (leading)
        (if (whole)
            "<p:run charPrIDRef='1'><p:t>" ++ marker ++ "</p:t></p:run><p:run charPrIDRef='2'><p:t>BC</p:t></p:run>"
        else
            "<p:run charPrIDRef='1'><p:t>" ++ marker ++ "</p:t></p:run><p:run charPrIDRef='2'><p:t>B</p:t></p:run><p:run charPrIDRef='1'><p:t>C</p:t></p:run>")
    else
        (if (whole)
            "<p:run charPrIDRef='2'><p:t>BC" ++ marker ++ "</p:t></p:run><p:run charPrIDRef='1'><p:t></p:t></p:run>"
        else
            "<p:run charPrIDRef='2'><p:t>B</p:t></p:run><p:run charPrIDRef='1'><p:t>C" ++ marker ++ "</p:t></p:run><p:run charPrIDRef='1'><p:t></p:t></p:run>");
    const expected = try std.mem.concat(a, u8, &.{ head, "<p:p>", body, "</p:p></s:sec>" });
    defer a.free(expected);
    try std.testing.expectEqualStrings(expected, reopened.sections[0].tree.source);
    const again = try reopened.save();
    defer a.free(again);
    try std.testing.expectEqualSlices(u8, saved, again);
    try std.testing.expectEqualSlices(u8, input, session.source);
}

test "plain no-field leading title actual Session canonical options whole and partial" {
    try exercise(true, true);
    try exercise(true, false);
}

test "plain no-field trailing title actual Session canonical options whole and partial" {
    try exercise(false, true);
    try exercise(false, false);
}
