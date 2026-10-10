//! Candidate alignment tests; public merge/save integration is a separate gate.
const std = @import("std");
const union_sites = @import("paragraph_site_union.zig");
const text = @import("text_sites.zig");
const Tree = @import("xml_part_tree.zig").Tree;

test "paragraph site union retains derived text and rejects fabricated bindings" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:secPr/></p:run><p:run><p:t>AB</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var left = try text.collect(a, &tree, .{});
    defer left.deinit(a);
    var right = try @import("continuation_empty_run.zig").clone(a, &tree, 1, &left);
    defer right.deinit(a);
    try std.testing.expect(try @import("text_site_edit.zig").splice(a, &right, 0, 0, 0, "한😀<&", 10000));
    var pair = try union_sites.prepare(a, &tree, 1, &left, &right, 10000);
    defer pair.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), pair.left.items.len);
    try std.testing.expectEqualStrings("", pair.left.items[0].text);
    try std.testing.expectEqualStrings("한😀<&", pair.right.items[0].text);
    try std.testing.expectEqualStrings("AB", pair.left.items[1].text);
    try std.testing.expectEqualStrings("AB", pair.right.items[1].text);
    pair.right.items[0].text[pair.right.items[0].text.len - 1] = 'X';
    try std.testing.expectEqualStrings("한😀<&", right.items[0].text);
    const missing: text.Sites = .{ .items = &.{} };
    try std.testing.expectError(error.SourceBindingMismatch, union_sites.prepare(a, &tree, 1, &missing, &right, 10000));
    try std.testing.expectError(error.SourceBindingMismatch, union_sites.prepare(a, &tree, 0, &left, &right, 10000));
    try std.testing.expectError(error.LimitExceeded, union_sites.prepare(a, &tree, 1, &left, &right, 0));
    const offset = right.items[0].end;
    right.items[0].end += 1;
    try std.testing.expectError(error.SourceBindingMismatch, union_sites.prepare(a, &tree, 1, &left, &right, 10000));
    right.items[0].end = offset;
    std.mem.swap(text.Site, &right.items[0], &right.items[1]);
    try std.testing.expectError(error.SourceBindingMismatch, union_sites.prepare(a, &tree, 1, &left, &right, 10000));
    std.mem.swap(text.Site, &right.items[0], &right.items[1]);
    const duplicate_rows = try a.alloc(text.Site, right.items.len + 1);
    defer a.free(duplicate_rows);
    @memcpy(duplicate_rows[0..right.items.len], right.items);
    duplicate_rows[right.items.len] = right.items[0];
    const duplicate: text.Sites = .{ .items = duplicate_rows };
    try std.testing.expectError(error.SourceBindingMismatch, union_sites.prepare(a, &tree, 1, &left, &duplicate, 10000));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, one: *const text.Sites, two: *const text.Sites) !void {
            var output = try union_sites.prepare(allocator, parsed, 1, one, two, 10000);
            defer output.deinit(allocator);
        }
    }.run, .{ &tree, &left, &right });
    try std.testing.expectEqual(@as(usize, 1), left.items.len);
    try std.testing.expectEqualStrings("한😀<&", right.items[0].text);
}
