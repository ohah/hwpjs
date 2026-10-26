//! 실제 Session 회귀입니다. topology prototype의 통과 검사와 별도로 실행합니다.
const std = @import("std");
const editor = @import("editor_session.zig");
const head = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList><h:charProperties itemCnt='2'><h:charPr id='1' height='1000'/><h:charPr id='2' height='1200'/></h:charProperties></h:refList></h:head>";

test "title zero actual Session trailing partial delete insert preserves full XML marker owner and ranges" {
    const a = std.testing.allocator;
    const source = head ++ "<p:p><p:run charPrIDRef='1'><p:t>X</p:t><p:t>A</p:t><p:t>BC<p:titleMark ignore='1'/></p:t></p:run></p:p></s:sec>";
    const input = try @import("test_formula_fixture.zig").zipWithSectionHeader(a, source, header);
    defer a.free(input);
    var current = try editor.open(a, input, .{});
    defer current.deinit();
    try std.testing.expect(try current.setCharacterFormat(0, 1, 2, 3, 2));
    const formatted = try current.save();
    defer a.free(formatted);
    var reopened = try editor.open(a, formatted, .{});
    defer reopened.deinit();
    // C 실측과 같은 실제 공개 Session 경로입니다. Paragraph/Span은 주입하지 않습니다.
    try std.testing.expect(try current.splice(0, 1, 3, 1, ""));
    try std.testing.expect(try reopened.splice(0, 1, 3, 1, ""));
    try std.testing.expect(try current.splice(0, 1, 3, 0, "Y"));
    try std.testing.expect(try reopened.splice(0, 1, 3, 0, "Y"));
    const current_bytes = try current.save();
    defer a.free(current_bytes);
    const reopened_bytes = try reopened.save();
    defer a.free(reopened_bytes);
    var current_saved = try editor.open(a, current_bytes, .{});
    defer current_saved.deinit();
    var reopened_saved = try editor.open(a, reopened_bytes, .{});
    defer reopened_saved.deinit();
    // section 전체를 비교하므로 title의 enclosing run style 차이도 숨겨지지 않습니다.
    try std.testing.expectEqualStrings(current_saved.sections[0].tree.source, reopened_saved.sections[0].tree.source);
    try std.testing.expectEqualSlices(u8, current_bytes, reopened_bytes);
    const left = try @import("character_style_snapshot.zig").read(&current, 0, 1);
    defer a.free(left);
    const right = try @import("character_style_snapshot.zig").read(&reopened, 0, 1);
    defer a.free(right);
    try std.testing.expectEqual(left.len, right.len);
    for (left, right) |one, two| try std.testing.expectEqualDeep(one, two);
    try std.testing.expectEqualSlices(u8, input, current.source);
}
