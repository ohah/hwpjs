const std = @import("std");
const bindings = @import("container_caption_bindings.zig");
const values = @import("table_caption_values.zig");
const tree_mod = @import("section_tree.zig");
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'>";

test "HWPX container caption exact ownership and absent values" {
    const a = std.testing.allocator;
    const xml = prefix ++ "<p:container><p:caption side='BOTTOM'><p:subList><p:p/></p:subList></p:caption></p:container></s:sec>";
    var tree = try tree_mod.parse(a, xml, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectEqualDeep(@as(?bindings.Owner, .{ .container_node = 1, .caption_node = 2, .list_node = 3 }), try bindings.resolve(&tree, 4));
    const caption = (try values.readContainer(a, &tree, 1)).?;
    try std.testing.expectEqual(@as(?u32, 3), caption.side);
    try std.testing.expectEqual(@as(?i64, null), caption.gap);
    try std.testing.expectEqual(@as(?u32, null), caption.line_wrap);
    try std.testing.expectEqual(@as(?@import("picture_caption_bindings.zig").Owner, null), try @import("picture_caption_bindings.zig").resolve(&tree, 4));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: []const u8) !void {
            var parsed = try tree_mod.parse(allocator, input, 0, 0, .{});
            defer parsed.deinit(allocator);
            _ = try values.readContainer(allocator, &parsed, 1);
            _ = try bindings.resolve(&parsed, 4);
        }
    }.run, .{xml});
}

test "HWPX container caption rejects duplicate and foreign ownership" {
    const a = std.testing.allocator;
    for ([_][]const u8{
        "<p:container><p:caption><p:subList><p:p/></p:subList></p:caption><p:caption/></p:container>",
        "<p:container><p:caption><p:subList><p:p/></p:subList><p:subList/></p:caption></p:container>",
    }) |body| {
        const xml = try std.fmt.allocPrint(a, "{s}{s}</s:sec>", .{ prefix, body });
        defer a.free(xml);
        var tree = try tree_mod.parse(a, xml, 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(error.AmbiguousContainerCaptionOwner, bindings.resolve(&tree, 4));
    }
    var foreign = try tree_mod.parse(a, prefix ++ "<p:container><x:caption><p:subList><p:p/></p:subList></x:caption></p:container></s:sec>", 0, 0, .{});
    defer foreign.deinit(a);
    try std.testing.expectEqual(@as(?bindings.Owner, null), try bindings.resolve(&foreign, 4));
    try std.testing.expectEqual(@as(?values.Values, null), try values.readContainer(a, &foreign, 1));
    try std.testing.expectError(error.InvalidContainerCaptionNode, values.readContainer(a, &foreign, 0));
}
