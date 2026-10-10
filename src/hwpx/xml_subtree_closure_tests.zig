const std = @import("std");
const trees = @import("xml_part_tree.zig");
const closure = @import("xml_subtree_closure.zig");

test "HWPX subtree closure converts UTF16 source and retains local declarations" {
    const a = std.testing.allocator;
    const wire = try std.unicode.utf8ToUtf16LeAlloc(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:outer'><p:p><p:run xmlns:x='urn:local' x:flag='한😀'><p:t>내용</p:t></p:run></p:p></s:sec>");
    defer a.free(wire);
    const source = try std.mem.concat(a, u8, &.{ &.{ 0xff, 0xfe }, std.mem.sliceAsBytes(wire) });
    defer a.free(source);
    var tree = try trees.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    const output = try closure.write(a, &tree, 2, 10000);
    defer a.free(output);
    try std.testing.expect(std.unicode.utf8ValidateSlice(output));
    const moved = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'>", output, "</s:sec>" });
    defer a.free(moved);
    var parsed = try trees.parse(a, moved, .section, 0, 0, .{});
    defer parsed.deinit(a);
    const flag = (try parsed.attributeValue(a, 1, "urn:local", "flag")).?;
    const text = try flag.toUtf8(a, 100);
    defer a.free(text);
    try std.testing.expectEqualStrings("한😀", text);
}

test "HWPX subtree closure retains shadowed prefixes and absent default namespace" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:outer'><p:p xmlns:x='urn:right&amp;&quot;'><p:run x:flag='keep'><p:t>한😀</p:t><unknown/></p:run></p:p></s:sec>";
    var tree = try trees.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    const output = try closure.write(a, &tree, 2, 10000);
    defer a.free(output);
    const moved = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:left' xmlns='urn:capture'><p:p>", output, "</p:p></s:sec>" });
    defer a.free(moved);
    var parsed = try trees.parse(a, moved, .section, 0, 0, .{});
    defer parsed.deinit(a);
    for (tree.elements[2..5], parsed.elements[2..5]) |before, after| {
        try std.testing.expectEqualStrings(before.name.uri, after.name.uri);
        try std.testing.expectEqualStrings(before.name.local.raw, after.name.local.raw);
    }
    const flag = (try parsed.attributeValue(a, 2, "urn:right&\"", "flag")).?;
    const text = try flag.toUtf8(a, 100);
    defer a.free(text);
    try std.testing.expectEqualStrings("keep", text);
    try std.testing.expectError(error.LimitExceeded, closure.write(a, &tree, 2, 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: *const trees.Tree) !void {
            const result = try closure.write(allocator, original, 2, 10000);
            defer allocator.free(result);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(source, tree.source);
}
