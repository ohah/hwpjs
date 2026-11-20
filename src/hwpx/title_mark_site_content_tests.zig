const std = @import("std");
const a = std.testing.allocator;
const content = @import("title_mark_site_content.zig");
const marker = "<p:titleMark ignore='false'/>";
fn emission(allocator: std.mem.Allocator) !void {
    const result = try content.write(allocator, "한😀한<&", &.{
        .{ .unit = 4, .xml = marker }, .{ .unit = 4, .xml = "<p:titleMark/>" },
    }, 1000);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("한😀한" ++ marker ++ "<p:titleMark/>&lt;&amp;", result);
}
test "document text title emission site keeps unit four stable equal-position order and XML escaping through OOM" {
    try emission(a);
    try @import("../testing/allocation_failures.zig").check(emission, .{});
}
test "document text title emission site refuses split scalar decreasing sparse and over-budget positions" {
    try std.testing.expectError(error.SplitSurrogatePair, content.write(a, "한😀한", &.{.{ .unit = 2, .xml = marker }}, 1000));
    try std.testing.expectError(error.InvalidTextPosition, content.write(a, "한😀한", &.{
        .{ .unit = 4, .xml = marker }, .{ .unit = 3, .xml = marker },
    }, 1000));
    try std.testing.expectError(error.InvalidTextPosition, content.write(a, "한😀한", &.{.{ .unit = std.math.maxInt(u32), .xml = marker }}, 1000));
    try std.testing.expectError(error.LimitExceeded, content.write(a, "한😀한", &.{.{ .unit = 4, .xml = marker }}, 1));
}
test "document text title emission site shares original writer materialization and rejects mixed source modes" {
    const writer = @import("xml_source_writer.zig");
    const body = try content.write(a, "한😀한", &.{.{ .unit = 4, .xml = marker }}, 1000);
    defer a.free(body);
    const empty = "<p:t/>";
    const expanded = try writer.write(a, empty, &.{.{ .start = 0, .end = empty.len, .text = "", .expand_empty_element = true, .serialized_content = body }}, 1000);
    defer a.free(expanded);
    try std.testing.expectEqualStrings("<p:t>한😀한" ++ marker ++ "</p:t>", expanded);
    const run = "<p:run></p:run>";
    const virtual = try writer.write(a, run, &.{.{ .start = 7, .end = 7, .text = "", .run_opening = .{ .start = 0, .end = 7 }, .serialized_content = body }}, 1000);
    defer a.free(virtual);
    try std.testing.expectEqualStrings("<p:run><p:t>한😀한" ++ marker ++ "</p:t></p:run>", virtual);
    try std.testing.expectError(error.InvalidSourceSpan, writer.write(a, empty, &.{.{ .start = 0, .end = empty.len, .text = "text", .serialized_content = body }}, 1000));
    try std.testing.expectError(error.InvalidSourceSpan, writer.write(a, empty, &.{.{ .start = 0, .end = empty.len, .text = "", .serialized_xml = body, .serialized_content = body }}, 1000));
    try std.testing.expectError(error.InvalidSourceSpan, writer.write(a, empty, &.{.{ .start = 0, .end = empty.len, .text = "", .start_tag = empty, .serialized_content = body }}, 1000));
}
