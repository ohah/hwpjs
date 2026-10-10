//! Authoritative pending dimension scalars; never stores mutable XML caches.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const dimension = @import("picture_dimension_values.zig");
const writer = @import("picture_dimension_write.zig");
pub const Entry = struct { picture_node: usize, update: writer.Update };
pub const Values = std.ArrayList(Entry);

fn overlay(value: *dimension.Values, update: writer.Update) void {
    if (update.display) |pair| value.display = .{ pair[0], pair[1] };
    if (update.original) |pair| value.original = .{ pair[0], pair[1] };
    if (update.current) |pair| value.current = .{ pair[0], pair[1] };
}

pub fn read(a: std.mem.Allocator, tree: *const Tree, values: *const Values, node: usize) !dimension.Values {
    var result = try dimension.read(a, tree, node);
    for (values.items) |entry| if (entry.picture_node == node) {
        overlay(&result, entry.update);
        break;
    };
    return result;
}

fn normalized(pair: [2]?u32, original: [2]?u32) ?[2]u32 {
    if (std.meta.eql(pair, original)) return null;
    return .{ pair[0].?, pair[1].? };
}

pub fn set(a: std.mem.Allocator, tree: *const Tree, values: *Values, node: usize, requested: writer.Update, limit: usize) !bool {
    // Validate requested fields before normalization, including missing attributes.
    const validated = try writer.write(a, tree, node, requested, limit);
    defer a.free(validated);
    const original = try dimension.read(a, tree, node);
    const before = try read(a, tree, values, node);
    var after = before;
    overlay(&after, requested);
    if (std.meta.eql(before, after)) return false;
    if (try dimension.protection(a, tree, node) == true) return error.PictureSizeProtected;
    const update: writer.Update = .{
        .display = normalized(after.display, original.display),
        .original = normalized(after.original, original.original),
        .current = normalized(after.current, original.current),
    };
    for (values.items, 0..) |*entry, index| {
        if (entry.picture_node != node) continue;
        if (std.meta.eql(update, writer.Update{})) {
            _ = values.orderedRemove(index);
        } else entry.update = update;
        return true;
    }
    if (values.items.len >= 100000) return error.LimitExceeded;
    try values.append(a, .{ .picture_node = node, .update = update });
    return true;
}

fn allocationCase(a: std.mem.Allocator) !void {
    const input = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:pic><p:sz width='12' height='8'/><p:orgSz width='12' height='8'/><p:curSz width='0' height='0'/></p:pic></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, input, 0, 0, .{});
    defer tree.deinit(a);
    var values: Values = .empty;
    defer values.deinit(a);
    try std.testing.expect(!try set(a, &tree, &values, 1, .{}, 4096));
    try std.testing.expect(try set(a, &tree, &values, 1, .{ .display = .{ 9, 6 } }, 4096));
    try std.testing.expect(try set(a, &tree, &values, 1, .{ .current = .{ 9, 6 } }, 4096));
    const current = try read(a, &tree, &values, 1);
    try std.testing.expectEqualDeep(dimension.Values{ .display = .{ 9, 6 }, .original = .{ 12, 8 }, .current = .{ 9, 6 } }, current);
    try std.testing.expect(!try set(a, &tree, &values, 1, .{ .display = .{ 9, 6 } }, 4096));
    const rejected = set(a, &tree, &values, 1, .{ .display = .{ 1, 1 } }, 1) catch |err| switch (err) {
        error.LimitExceeded => null,
        else => return err,
    };
    try std.testing.expect(rejected == null);
    try std.testing.expectEqualDeep(current, try read(a, &tree, &values, 1));
    try std.testing.expect(try set(a, &tree, &values, 1, .{ .display = .{ 12, 8 } }, 4096));
    try std.testing.expectEqual(@as(usize, 1), values.items.len);
    try std.testing.expectEqual(@as(?[2]u32, null), values.items[0].update.display);
    try std.testing.expect(try set(a, &tree, &values, 1, .{ .current = .{ 0, 0 } }, 4096));
    try std.testing.expectEqual(@as(usize, 0), values.items.len);
    try std.testing.expectEqualStrings(input, tree.source);
}

test "HWPX picture dimension edit values merge partial requests remove restored values and clean allocation failures" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}

test "HWPX picture dimension edit values preserve an existing edit on every allocation failure" {
    const a = std.testing.allocator;
    const input = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:pic><p:sz width='12' height='8'/><p:curSz width='0' height='0'/></p:pic></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, input, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            // Existing storage is not allocated by the injected failing allocator.
            var values: Values = .empty;
            defer values.deinit(std.testing.allocator);
            try values.append(std.testing.allocator, .{ .picture_node = 1, .update = .{ .display = .{ 9, 6 } } });
            const original = values.items[0];
            _ = set(allocator, source, &values, 1, .{ .display = .{ 5, 4 }, .current = .{ 5, 4 } }, 4096) catch |err| {
                try std.testing.expectEqualDeep(original, values.items[0]);
                return err;
            };
            try std.testing.expectEqualDeep(@as(?[2]u32, .{ 5, 4 }), values.items[0].update.display);
            try std.testing.expectEqualDeep(@as(?[2]u32, .{ 5, 4 }), values.items[0].update.current);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(input, tree.source);
}
