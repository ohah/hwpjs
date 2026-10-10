//! Generated paragraph IDs only; existing XML IDs remain immutable.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const values = @import("xml_values.zig");
const uri = @import("document_xml.zig").paragraph_uri;

/// Scan every supplied immutable part, including inactive compatibility nodes.
/// Caller must supply all source parts and every current generated ID.
pub fn next(a: std.mem.Allocator, trees: []const Tree, generated: []const u32, max_paragraphs: usize) !u32 {
    var inventory = try collect(a, trees, generated, max_paragraphs);
    defer inventory.used.deinit(a);
    if (inventory.count == max_paragraphs) return error.LimitExceeded;
    return firstFree(&inventory.used, 1);
}

/// Owned result; one immutable inventory scan, no session mutation/reservation.
pub fn nextMany(a: std.mem.Allocator, trees: []const Tree, generated: []const u32, requested: usize, max_paragraphs: usize) ![]u32 {
    var inventory = try collect(a, trees, generated, max_paragraphs);
    defer inventory.used.deinit(a);
    if (requested > max_paragraphs - inventory.count) return error.LimitExceeded;
    const result = try a.alloc(u32, requested);
    errdefer a.free(result);
    var candidate: u32 = 1;
    for (result, 0..) |*id, index| {
        candidate = try firstFree(&inventory.used, candidate);
        id.* = candidate;
        if (index + 1 < result.len) candidate = std.math.add(u32, candidate, 1) catch return error.LimitExceeded;
    }
    return result;
}

fn firstFree(used: *const std.AutoHashMapUnmanaged(u32, void), start: u32) !u32 {
    var candidate = start;
    while (used.contains(candidate)) candidate = std.math.add(u32, candidate, 1) catch return error.LimitExceeded;
    return candidate;
}

const Inventory = struct { used: std.AutoHashMapUnmanaged(u32, void), count: usize };
fn collect(a: std.mem.Allocator, trees: []const Tree, generated: []const u32, max_paragraphs: usize) !Inventory {
    var used: std.AutoHashMapUnmanaged(u32, void) = .empty;
    errdefer used.deinit(a);
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
    return .{ .used = used, .count = count };
}

test "HWPX paragraph ID batches match sequential allocation and remain immutable on failure" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='0'/><p:p id='+01'/><p:p id='1'/><p:p id='3'/><p:p id='4294967296'/><p:p/></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    const generated = [_]u32{2};
    const batch = try nextMany(a, &.{tree}, &generated, 4, 11);
    defer a.free(batch);
    try std.testing.expectEqualSlices(u32, &.{ 4, 5, 6, 7 }, batch);
    const repeated = try nextMany(a, &.{tree}, &generated, 4, 11);
    defer a.free(repeated);
    try std.testing.expectEqualSlices(u32, batch, repeated);
    const following = try nextMany(a, &.{tree}, &.{ 2, 4, 5, 6, 7 }, 4, 15);
    defer a.free(following);
    try std.testing.expectEqualSlices(u32, &.{ 8, 9, 10, 11 }, following);
    var sequential: std.ArrayList(u32) = .empty;
    defer sequential.deinit(a);
    try sequential.appendSlice(a, &generated);
    for (batch) |expected| {
        const id = try next(a, &.{tree}, sequential.items, 11);
        try std.testing.expectEqual(expected, id);
        try sequential.append(a, id);
    }
    try std.testing.expectError(error.LimitExceeded, nextMany(a, &.{tree}, &generated, 5, 11));
    try std.testing.expectError(error.InvalidParagraphInstanceId, nextMany(a, &.{tree}, &.{ 2, 2 }, 0, 100));
    const empty = try nextMany(a, &.{tree}, &generated, 0, 7);
    defer a.free(empty);
    try std.testing.expectEqual(@as(usize, 0), empty.len);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: Tree) !void {
            const ids = try nextMany(allocator, &.{input}, &.{2}, 4, 11);
            defer allocator.free(ids);
            try std.testing.expectEqualSlices(u32, &.{ 4, 5, 6, 7 }, ids);
        }
    }.run, .{tree});
    try std.testing.expectEqual(@as(u32, 4), try next(a, &.{tree}, &generated, 11));
    try std.testing.expectEqualSlices(u32, &.{2}, &generated);
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
