//! 취소선 켜기/끄기는 shape만 변경하며 기존 색과 확장을 유지합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, enabled: bool, limit: usize) ![]u8 {
    var current = try @import("character_strike_values.zig").read(a, tree, node, 4096);
    defer if (current) |*value| value.deinit(a);
    const fragment = tree.sourceOf(node);
    if (fragment.len > limit) return error.LimitExceeded;
    if (current) |value| {
        if (value.shape) |shape| {
            const kind = @import("line_style_values.zig").typeIndex(shape) orelse return error.UnsupportedCharacterStrikeShape;
            if (enabled == (kind != 0)) return a.dupe(u8, fragment);
        }
        return @import("character_child_attribute_patch.zig").write(a, tree, node, "strikeout", "shape", if (enabled) "SOLID" else "NONE", limit);
    }
    if (!enabled) return a.dupe(u8, fragment);
    const following = [_][]const u8{ "outline", "shadow", "emboss", "engrave", "supscript", "subscript" };
    return @import("character_child_insert.zig").write(a, tree, node, "<strikeout xmlns=\"http://www.hancom.co.kr/hwpml/2011/head\" shape=\"SOLID\" color=\"#000000\"/>", &following, limit);
}

test "HWPX strike patch preserves color quotes opaque children and allocation failures" {
    const a = std.testing.allocator;
    const source = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:charPr><!--keep--><h:strikeout shape = 'DOT' color='#123456' opaque='keep'><h:extra/></h:strikeout></h:charPr><h:charPr/></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree) !void {
            const off = try write(allocator, parsed, 1, false, 4096);
            defer allocator.free(off);
            try std.testing.expectEqualStrings("<h:charPr><!--keep--><h:strikeout shape = 'NONE' color='#123456' opaque='keep'><h:extra/></h:strikeout></h:charPr>", off);
            const on = try write(allocator, parsed, 1, true, 4096);
            defer allocator.free(on);
            try std.testing.expectEqualStrings(parsed.sourceOf(1), on);
            const empty = try write(allocator, parsed, 4, false, 4096);
            defer allocator.free(empty);
            try std.testing.expectEqualStrings("<h:charPr/>", empty);
            const created = try write(allocator, parsed, 4, true, 4096);
            defer allocator.free(created);
            try std.testing.expect(std.mem.indexOf(u8, created, "shape=\"SOLID\" color=\"#000000\"") != null);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(source, tree.source);
}
