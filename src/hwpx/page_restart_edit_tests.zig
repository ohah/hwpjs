const std = @import("std");
const a = std.testing.allocator;
const edit = @import("page_restart_edit.zig");
const pre = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:own'><p:p><p:run><p:t>앞😀</p:t>";
const post = "<p:t>뒤</p:t></p:run></p:p><x:keep value='unchanged'/></s:sec>";
const control = "<p:ctrl><p:newNum numType='PAGE' num='7'/></p:ctrl>";
fn parse(source: []const u8) !@import("xml_part_tree.zig").Tree {
    return @import("section_tree.zig").parse(a, source, 0, 0, .{});
}
fn selected(tree: *const @import("xml_part_tree.zig").Tree) !usize {
    for (tree.elements, 0..) |node, index| if (node.is(@import("document_xml.zig").paragraph_uri, "newNum")) return index;
    return error.MissingPageRestart;
}
test "HX existing PAGE restart patches only explicit num and reparses source" {
    var tree = try parse(pre ++ control ++ post);
    defer tree.deinit(a);
    const target = try edit.capture(a, &tree, try selected(&tree));
    const out = (try edit.write(a, &tree, target, 65535, 100000)).?;
    defer a.free(out);
    try std.testing.expectEqualStrings(pre ++ "<p:ctrl><p:newNum numType='PAGE' num='65535'/></p:ctrl>" ++ post, out);
    var reopened = try parse(out);
    defer reopened.deinit(a);
    try std.testing.expectEqual(@as(u16, 65535), (try edit.capture(a, &reopened, try selected(&reopened))).number);
    try std.testing.expectEqualStrings(pre ++ control ++ post, tree.source);
}
test "HX existing PAGE restart noop validates digest before preserving source" {
    var tree = try parse(pre ++ control ++ post);
    defer tree.deinit(a);
    var target = try edit.capture(a, &tree, try selected(&tree));
    try std.testing.expect((try edit.write(a, &tree, target, 7, 100000)) == null);
    target.section_digest[0] ^= 1;
    try std.testing.expectError(error.StalePageRestartSnapshot, edit.write(a, &tree, target, 7, 100000));
    try std.testing.expectError(error.InvalidPageRestartNumber, edit.write(a, &tree, target, 0, 100000));
}
test "HX existing PAGE restart rejects unknown kind missing number opaque attributes children and conditional owner" {
    const bodies = [_][]const u8{
        "<p:ctrl><p:newNum numType='FOOTNOTE' num='7'/></p:ctrl>",
        "<p:ctrl><p:newNum numType='PAGE'/></p:ctrl>",
        "<p:ctrl><p:newNum numType='PAGE' num='0'/></p:ctrl>",
        "<p:ctrl><p:newNum numType='PAGE' num='65536'/></p:ctrl>",
        "<p:ctrl><p:newNum numType='PAGE' num='7' x:unknown='1'/></p:ctrl>",
        "<p:ctrl><p:newNum numType='PAGE' num='7'><x:child/></p:newNum></p:ctrl>",
        "<x:switch><p:ctrl><p:newNum numType='PAGE' num='7'/></p:ctrl></x:switch>",
    };
    for (bodies) |body| {
        const source = try std.mem.concat(a, u8, &.{ pre, body, post });
        defer a.free(source);
        var tree = try parse(source);
        defer tree.deinit(a);
        if (edit.capture(a, &tree, try selected(&tree))) |_| return error.ExpectedRejection else |err| {
            if (err != error.UnsupportedPageRestartOwner and err != error.InvalidPageRestartNumber) return err;
        }
        try std.testing.expectEqualStrings(source, tree.source);
    }
}
test "HX existing PAGE restart rejects duplicate paragraph owners and foreign namespace" {
    var tree = try parse(pre ++ control ++ control ++ post);
    defer tree.deinit(a);
    try std.testing.expectError(error.AmbiguousPageRestart, edit.capture(a, &tree, try selected(&tree)));
    var foreign = try parse(pre ++ "<p:ctrl><x:newNum numType='PAGE' num='7'/></p:ctrl>" ++ post);
    defer foreign.deinit(a);
    for (foreign.elements, 0..) |node, index| if (node.is("urn:own", "newNum")) {
        try std.testing.expectError(error.MissingPageRestart, edit.capture(a, &foreign, index));
        return;
    };
    return error.MissingOwnNegativeFixture;
}
test "HX existing PAGE restart allocation failures leave borrowed XML unchanged" {
    var tree = try parse(pre ++ control ++ post);
    defer tree.deinit(a);
    const target = try edit.capture(a, &tree, try selected(&tree));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("xml_part_tree.zig").Tree, expected: edit.Target) !void {
            const out = (try edit.write(allocator, source, expected, 9, 100000)).?;
            defer allocator.free(out);
        }
    }.run, .{ &tree, target });
    try std.testing.expectEqualStrings(pre ++ control ++ post, tree.source);
}
