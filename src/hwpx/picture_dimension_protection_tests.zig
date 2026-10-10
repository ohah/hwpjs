const std = @import("std");
const dimension = @import("picture_dimension_values.zig");
const edit = @import("picture_dimension_edit_values.zig");

test "HWPX picture dimension protection refuses changes and keeps no-op and source untouched" {
    const a = std.testing.allocator;
    const input = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:pic><p:sz width='12' height='8' protect='true'/></p:pic></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, input, 0, 0, .{});
    defer tree.deinit(a);
    var values: edit.Values = .empty;
    defer values.deinit(a);
    try std.testing.expectEqual(@as(?bool, true), try dimension.protection(a, &tree, 1));
    try std.testing.expectError(error.PictureSizeProtected, edit.set(a, &tree, &values, 1, .{ .display = .{ 9, 6 } }, 4096));
    try std.testing.expect(!try edit.set(a, &tree, &values, 1, .{ .display = .{ 12, 8 } }, 4096));
    try std.testing.expectEqual(@as(usize, 0), values.items.len);
    try std.testing.expectEqualStrings(input, tree.source);
}

test "HWPX picture dimension protection keeps absent distinct from false and ignores foreign attributes" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:other'>";
    inline for (.{ .{ "", @as(?bool, null) }, .{ " protect='0'", @as(?bool, false) }, .{ " x:protect='true'", @as(?bool, null) }, .{ " protect='&#49;'", @as(?bool, true) } }) |case| {
        var tree = try @import("section_tree.zig").parse(a, prefix ++ "<p:pic><p:sz width='12' height='8'" ++ case[0] ++ "/></p:pic></s:sec>", 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectEqual(case[1], try dimension.protection(a, &tree, 1));
    }
}
