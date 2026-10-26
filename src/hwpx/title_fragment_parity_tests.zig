//! Actual Session controls for the two remaining formatted fragment deletions.
const std = @import("std");
const editor = @import("editor_session.zig");
const head = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='1'>";
const tail = "</p:run></p:p></s:sec>";
const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList><h:charProperties itemCnt='2'><h:charPr id='1' height='1000'/><h:charPr id='2' height='1200'/></h:charProperties></h:refList></h:head>";

fn parity(a: std.mem.Allocator, field: bool) !void {
    const body = if (field)
        "<p:t>X</p:t><p:ctrl><p:fieldBegin id='4242424242' type='CLICK_HERE' dirty='0'/></p:ctrl><p:t>A</p:t><p:ctrl><p:fieldEnd beginIDRef='4242424242'/></p:ctrl><p:t>BC<p:titleMark ignore='1'/>DE</p:t>"
    else
        "<p:t>X</p:t><p:t>A</p:t><p:t><p:titleMark ignore='1'/>BC</p:t>";
    const xml = try std.mem.concat(a, u8, &.{ head, body, tail });
    defer a.free(xml);
    const input = try @import("test_formula_fixture.zig").zipWithSectionHeader(a, xml, header);
    defer a.free(input);
    var current = try editor.open(a, input, .{});
    defer current.deinit();
    try std.testing.expect(try current.setCharacterFormat(0, 1, if (field) 3 else 2, if (field) 5 else 3, 2));
    const formatted = try current.save();
    defer a.free(formatted);
    var reopened = try editor.open(a, formatted, .{});
    defer reopened.deinit();
    const at: u32 = if (field) 4 else 2;
    try std.testing.expect(try current.splice(0, 1, at, 1, ""));
    try std.testing.expect(try reopened.splice(0, 1, at, 1, ""));
    try std.testing.expect(try current.splice(0, 1, at, 0, "Y"));
    try std.testing.expect(try reopened.splice(0, 1, at, 0, "Y"));
    const left = try current.save();
    defer a.free(left);
    const right = try reopened.save();
    defer a.free(right);
    try std.testing.expectEqualSlices(u8, left, right);
    const ranges_left = try @import("character_style_snapshot.zig").read(&current, 0, 1);
    defer a.free(ranges_left);
    const ranges_right = try @import("character_style_snapshot.zig").read(&reopened, 0, 1);
    defer a.free(ranges_right);
    try std.testing.expectEqualDeep(ranges_left, ranges_right);
    try std.testing.expectEqualSlices(u8, input, current.source);
}

test "title fragment canonical leading partial delete insert exact parity" {
    try parity(std.testing.allocator, false);
}

test "title fragment canonical field middle partial delete insert exact parity" {
    try parity(std.testing.allocator, true);
}
