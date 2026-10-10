//! Generated paragraph IDs only; existing XML IDs remain immutable.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const values = @import("xml_values.zig");
const uri = @import("document_xml.zig").paragraph_uri;

/// Scan every supplied immutable part, including inactive compatibility nodes.
/// Caller must supply all source parts and every current generated ID.
pub fn next(a: std.mem.Allocator, trees: []const Tree, generated: []const u32, max_paragraphs: usize) !u32 {
    var used: std.AutoHashMapUnmanaged(u32, void) = .empty;
    defer used.deinit(a);
    var count: usize = 0;
    for (trees) |*tree| {
        for (tree.elements, 0..) |element, index| {
            if (!element.is(uri, "p")) continue;
            if (count == max_paragraphs) return error.LimitExceeded;
            count += 1;
            const raw = (try tree.attributeValue(a, index, "", "id")) orelse continue;
            const text = try raw.toUtf8(a, 4096);
            defer a.free(text);
            // Nonnegative XML IDs are not necessarily UINT32. Valid wider
            // originals cannot collide with a generated u32 and stay unchanged.
            _ = try values.nonNegative(text);
            const id = values.unsigned32(text) catch |err| switch (err) {
                error.InvalidUnsigned32 => continue,
                else => return err,
            };
            try used.put(a, id, {});
        }
    }
    for (generated) |id| {
        if (count == max_paragraphs) return error.LimitExceeded;
        count += 1;
        if (id == 0 or used.contains(id)) return error.InvalidParagraphInstanceId;
        try used.put(a, id, {});
    }
    // Reserve space for the instance the caller is about to create.
    if (count == max_paragraphs) return error.LimitExceeded;
    var candidate: u32 = 1;
    while (used.contains(candidate)) candidate = std.math.add(u32, candidate, 1) catch return error.LimitExceeded;
    return candidate;
}

test "HWPX paragraph instance IDs preserve duplicates wide IDs and allocation failure" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='0'/><p:p id='+01'/><p:p id='1'/><p:p id='3'/><p:p id='4294967295'/><p:p id='4294967296'/><p:p/></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectEqual(@as(u32, 2), try next(a, &.{tree}, &.{}, 100));
    try std.testing.expectEqual(@as(u32, 4), try next(a, &.{tree}, &.{2}, 100));
    try std.testing.expectEqual(@as(u32, 4), try next(a, &.{ tree, tree }, &.{2}, 100));
    try std.testing.expectError(error.InvalidParagraphInstanceId, next(a, &.{tree}, &.{1}, 100));
    try std.testing.expectError(error.InvalidParagraphInstanceId, next(a, &.{tree}, &.{ 2, 2 }, 100));
    try std.testing.expectError(error.InvalidParagraphInstanceId, next(a, &.{tree}, &.{0}, 100));
    try std.testing.expectError(error.LimitExceeded, next(a, &.{tree}, &.{}, 6));
    try std.testing.expectError(error.LimitExceeded, next(a, &.{tree}, &.{}, 7));
    try std.testing.expectError(error.LimitExceeded, next(a, &.{tree}, &.{2}, 7));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: Tree) !void {
            try std.testing.expectEqual(@as(u32, 4), try next(allocator, &.{source}, &.{2}, 100));
        }
    }.run, .{tree});
}
