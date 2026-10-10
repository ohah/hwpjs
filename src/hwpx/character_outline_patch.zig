const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Kind = @import("../model/character_outline_kind.zig").Kind;
pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, kind: Kind, limit: usize) ![]u8 {
    const token = try @import("character_outline_kind.zig").token(kind);
    const display = @import("character_outline_display.zig");
    const current = try display.read(a, tree, node, 4096);
    const fragment = tree.sourceOf(node);
    if (fragment.len > limit) return error.LimitExceeded;
    // The session handles absent+none no-op before cloning. A clone intent
    // may remove an earlier SOLID edit whose original template was absent.
    if (current != null and display.matches(current, kind)) return a.dupe(u8, fragment);
    if (current != null) return @import("character_child_attribute_patch.zig").write(a, tree, node, "outline", "type", token, limit);
    const following = [_][]const u8{ "shadow", "emboss", "engrave", "supscript", "subscript" };
    const flag = try std.fmt.allocPrint(a, "<outline xmlns=\"http://www.hancom.co.kr/hwpml/2011/head\" type=\"{s}\"/>", .{token});
    defer a.free(flag);
    return @import("character_child_insert.zig").write(a, tree, node, flag, &following, limit);
}

test "HWPX outline patch preserves unknown extensions quotes and allocation failures" {
    const a = std.testing.allocator;
    const source = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:charPr><h:outline type = 'FUTURE' keep='v'><h:extra/></h:outline><h:shadow/></h:charPr><h:charPr/></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .header, null, 0, .{});
    defer tree.deinit(a);
    for ([_]Kind{ .dot, .thick, .dash, .dash_dot, .dash_dot_dot }) |kind| try std.testing.expectError(error.UnsupportedCharacterOutlineKind, write(a, &tree, 1, kind, 4096));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree) !void {
            const changed = try write(allocator, parsed, 1, .solid, 4096);
            defer allocator.free(changed);
            try std.testing.expectEqualStrings("<h:charPr><h:outline type = 'SOLID' keep='v'><h:extra/></h:outline><h:shadow/></h:charPr>", changed);
            const removed = try write(allocator, parsed, 5, .none, 4096);
            defer allocator.free(removed);
            try std.testing.expectEqualStrings("<h:charPr><outline xmlns=\"http://www.hancom.co.kr/hwpml/2011/head\" type=\"NONE\"/></h:charPr>", removed);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(source, tree.source);
}
