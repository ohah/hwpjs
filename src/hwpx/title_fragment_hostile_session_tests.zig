//! 실제 Session 경로의 반례 후보입니다. 이 파일을 작성한 agent는 실행하지 않았습니다.
const std = @import("std");
const editor = @import("editor_session.zig");
const a = std.testing.allocator;
const head = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList><h:charProperties itemCnt='2'><h:charPr id='1' height='1000'/><h:charPr id='2' height='1200'/></h:charProperties></h:refList></h:head>";

fn input(body: []const u8) ![]u8 {
    const section = try std.mem.concat(a, u8, &.{ head, "<p:p>", body, "</p:p></s:sec>" });
    defer a.free(section);
    return @import("test_formula_fixture.zig").zipWithSectionHeader(a, section, header);
}

fn equal(current: *editor.Session, reopened: *editor.Session) !void {
    const left = try current.save();
    defer a.free(left);
    const right = try reopened.save();
    defer a.free(right);
    var left_saved = try editor.open(a, left, .{});
    defer left_saved.deinit();
    var right_saved = try editor.open(a, right, .{});
    defer right_saved.deinit();
    // 표시 문자열만 비교하지 않습니다. 빈 run/t와 title enclosing style도 포함합니다.
    try std.testing.expectEqualStrings(left_saved.sections[0].tree.source, right_saved.sections[0].tree.source);
    try std.testing.expectEqualSlices(u8, left, right);
    const left_ranges = try @import("character_style_snapshot.zig").read(current, 0, 1);
    defer a.free(left_ranges);
    const right_ranges = try @import("character_style_snapshot.zig").read(reopened, 0, 1);
    defer a.free(right_ranges);
    try std.testing.expectEqual(left_ranges.len, right_ranges.len);
    for (left_ranges, right_ranges) |one, two| try std.testing.expectEqualDeep(one, two);
}

test "hostile fragment identity plain sibling run deleted identified tail stays editable" {
    const bytes = try input("<p:run charPrIDRef='1'><p:t>T<p:titleMark ignore='1'/></p:t></p:run><p:run charPrIDRef='1'><p:t>AB</p:t></p:run>");
    defer a.free(bytes);
    var current = try editor.open(a, bytes, .{});
    defer current.deinit();
    // T=0, A=1, B=2. 실제 title 없는 두 번째 run의 B만 서식 변경합니다.
    try std.testing.expect(try current.setCharacterFormat(0, 1, 2, 3, 2));
    const formatted = try current.save();
    defer a.free(formatted);
    var reopened = try editor.open(a, formatted, .{});
    defer reopened.deinit();
    try std.testing.expect(try current.splice(0, 1, 2, 1, ""));
    try std.testing.expect(try reopened.splice(0, 1, 2, 1, ""));
    try equal(&current, &reopened);
    try std.testing.expectEqualSlices(u8, bytes, current.source);
}

test "hostile fragment identity same style reformat preserves derived trailing zero owners" {
    const bytes = try input("<p:run charPrIDRef='1'><p:t>BC<p:titleMark ignore='1'/></p:t></p:run>");
    defer a.free(bytes);
    var current = try editor.open(a, bytes, .{});
    defer current.deinit();
    try std.testing.expect(try current.setCharacterFormat(0, 1, 0, 1, 2));
    const formatted = try current.save();
    defer a.free(formatted);
    var reopened = try editor.open(a, formatted, .{});
    defer reopened.deinit();
    // 첫 format이 B2/C1을 분리한 뒤 C도 2로 만듭니다. 기존 경계를 합치지 않아야 합니다.
    try std.testing.expect(try current.setCharacterFormat(0, 1, 1, 2, 2));
    try std.testing.expect(try reopened.setCharacterFormat(0, 1, 1, 2, 2));
    try equal(&current, &reopened);
    try std.testing.expectEqualSlices(u8, bytes, current.source);
}

test "hostile fragment identity uniform per text whole format does not gratuitously split" {
    const bytes = try input("<p:run charPrIDRef='1'><p:t>B<p:titleMark ignore='1'/>C</p:t></p:run>");
    defer a.free(bytes);
    var current = try editor.open(a, bytes, .{});
    defer current.deinit();
    try std.testing.expect(try current.setCharacterFormat(0, 1, 0, 2, 2));
    const formatted = try current.save();
    defer a.free(formatted);
    var reopened = try editor.open(a, formatted, .{});
    defer reopened.deinit();
    const expected = head ++ "<p:p><p:run charPrIDRef='2'><p:t>B<p:titleMark ignore='1'/>C</p:t></p:run></p:p></s:sec>";
    try std.testing.expectEqualStrings(expected, reopened.sections[0].tree.source);
    try equal(&current, &reopened);
}

test "hostile leading insertion then selected reformat uses same canonical owner" {
    const bytes = try input("<p:run charPrIDRef='1'><p:t><p:titleMark ignore='1'/>BC</p:t></p:run>");
    defer a.free(bytes);
    var current = try editor.open(a, bytes, .{});
    defer current.deinit();
    try std.testing.expect(try current.setCharacterFormat(0, 1, 0, 1, 2));
    const formatted = try current.save();
    defer a.free(formatted);
    var reopened = try editor.open(a, formatted, .{});
    defer reopened.deinit();
    try std.testing.expect(try current.splice(0, 1, 0, 0, "Y"));
    try std.testing.expect(try reopened.splice(0, 1, 0, 0, "Y"));
    try std.testing.expect(try current.setCharacterFormat(0, 1, 0, 1, 2));
    try std.testing.expect(try reopened.setCharacterFormat(0, 1, 0, 1, 2));
    try equal(&current, &reopened);
}

test "hostile middle title restore right style keeps prior canonical container" {
    const bytes = try input("<p:run charPrIDRef='1'><p:t>B<p:titleMark ignore='1'/>C</p:t></p:run>");
    defer a.free(bytes);
    var current = try editor.open(a, bytes, .{});
    defer current.deinit();
    try std.testing.expect(try current.setCharacterFormat(0, 1, 1, 2, 2));
    const formatted = try current.save();
    defer a.free(formatted);
    var reopened = try editor.open(a, formatted, .{});
    defer reopened.deinit();
    try std.testing.expect(try current.setCharacterFormat(0, 1, 1, 2, 1));
    try std.testing.expect(try reopened.setCharacterFormat(0, 1, 1, 2, 1));
    try equal(&current, &reopened);
}

test "hostile uniform whole title replacement has no invented empty fragment" {
    const content = "<p:t>X</p:t><p:ctrl><p:fieldBegin id='4242424242' type='CLICK_HERE' dirty='0'/></p:ctrl><p:t>A</p:t><p:ctrl><p:fieldEnd beginIDRef='4242424242'/></p:ctrl>";
    const bytes = try input("<p:run charPrIDRef='1'>" ++ content ++ "<p:t>B<p:titleMark ignore='1'/>C</p:t></p:run>");
    defer a.free(bytes);
    var current = try editor.open(a, bytes, .{});
    defer current.deinit();
    try std.testing.expect(try current.setCharacterFormat(0, 1, 0, 4, 2));
    try std.testing.expect(try current.splice(0, 1, 3, 1, "Y"));
    const saved = try current.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const expected = head ++ "<p:p><p:run charPrIDRef='2'>" ++ content ++ "<p:t>BY<p:titleMark ignore='1'/></p:t></p:run></p:p></s:sec>";
    try std.testing.expectEqualStrings(expected, reopened.sections[0].tree.source);
    try std.testing.expectEqualSlices(u8, bytes, current.source);
}
