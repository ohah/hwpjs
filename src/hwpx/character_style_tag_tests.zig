const std = @import("std");
const tag = @import("character_style_tag.zig");
test "HWPX character style tag preserves opaque namespace attributes and lexical no-op" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:opaque'><p:run charPrIDRef = '&#55;' x:charPrIDRef='9' x:opaque='keep&amp;x'/><p:run opaque='empty'/></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    const unchanged = try tag.write(a, &tree, 1, 7, 1000);
    defer a.free(unchanged);
    try std.testing.expectEqualStrings("<p:run charPrIDRef = '&#55;' x:charPrIDRef='9' x:opaque='keep&amp;x'/>", unchanged);
    const changed = try tag.write(a, &tree, 1, 0, 1000);
    defer a.free(changed);
    try std.testing.expectEqualStrings("<p:run charPrIDRef = '0' x:charPrIDRef='9' x:opaque='keep&amp;x'/>", changed);
    const added = try tag.write(a, &tree, 2, 9, 1000);
    defer a.free(added);
    try std.testing.expectEqualStrings("<p:run opaque='empty' charPrIDRef=\"9\"/>", added);
    try std.testing.expectError(error.LimitExceeded, tag.write(a, &tree, 1, 0, changed.len - 1));
    const exact = try tag.write(a, &tree, 1, 0, changed.len);
    defer a.free(exact);
    try std.testing.expectEqualStrings(changed, exact);
    const saved = try @import("xml_source_writer.zig").write(a, source, &.{.{
        .start = tree.elements[1].start_tag.start,
        .end = tree.elements[1].start_tag.end,
        .text = "",
        .start_tag = changed,
    }}, 1000);
    defer a.free(saved);
    var reopened = try @import("xml_part_tree.zig").parse(a, saved, .section, 0, 0, .{});
    defer reopened.deinit(a);
    const roundtrip = try tag.write(a, &reopened, 1, 0, 1000);
    defer a.free(roundtrip);
    try std.testing.expectEqualStrings(changed, roundtrip);
    try std.testing.expectError(error.LimitExceeded, tag.write(a, &tree, 1, 0, 1));
    try std.testing.expectError(error.InvalidRunElement, tag.write(a, &tree, 0, 0, 1000));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, borrowed: *const @import("xml_part_tree.zig").Tree) !void {
            const result = try tag.write(allocator, borrowed, 1, 0, 1000);
            defer allocator.free(result);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(source, tree.source);
}
