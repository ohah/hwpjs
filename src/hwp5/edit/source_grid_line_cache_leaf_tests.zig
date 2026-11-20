//! Synthetic framing/ownership regression; no original documents are required.
const std = @import("std");
const cache = @import("source_grid_line_cache.zig");
const source = @import("source_tree.zig");
const children = @import("../body/paragraph_children.zig");
const writer = @import("../record_writer.zig");
const version = @import("../version.zig").Version{ .raw = 0x05000300 };
const Order = enum { before_runs, after_runs };
const Mode = enum { none, leaf, opaque_child, duplicate_opaque };
const marker = "cache-owned-opaque";
const limit = 4096;

fn appendCache(a: std.mem.Allocator, out: *std.ArrayList(u8), has_descendant: bool) !void {
    var bytes: [36]u8 = @splat(0);
    std.mem.writeInt(i32, bytes[8..12], 12, .little);
    std.mem.writeInt(i32, bytes[12..16], 10, .little);
    std.mem.writeInt(i32, bytes[16..20], 8, .little);
    std.mem.writeInt(i32, bytes[28..32], 30, .little);
    try writer.append(a, out, 69, 1, &bytes, limit);
    if (has_descendant) try writer.append(a, out, 1001, 2, marker, limit);
}

fn input(a: std.mem.Allocator, order: Order, mode: Mode) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    var header: [22]u8 = @splat(0);
    std.mem.writeInt(u32, header[0..4], 1, .little);
    std.mem.writeInt(u16, header[12..14], 1, .little);
    std.mem.writeInt(u16, header[16..18], if (mode == .none) 0 else if (mode == .duplicate_opaque) 2 else 1, .little);
    std.mem.writeInt(u32, header[18..22], 1, .little);
    const runs: [8]u8 = @splat(0);
    try writer.append(a, &out, 66, 0, &header, limit);
    try writer.append(a, &out, 67, 1, &.{ 13, 0 }, limit);
    if (order == .after_runs) try writer.append(a, &out, 68, 1, &runs, limit);
    if (mode != .none) try appendCache(a, &out, mode == .opaque_child or mode == .duplicate_opaque);
    if (mode == .duplicate_opaque) try appendCache(a, &out, false);
    if (order == .before_runs) try writer.append(a, &out, 68, 1, &runs, limit);
    return out.toOwnedSlice(a);
}

// A successful generic parse is required independently of cache admission.
fn verifyAssociation(a: std.mem.Allocator, bytes: []const u8, has_descendant: bool) !void {
    var tree = try source.parse(a, bytes, version, .{});
    defer tree.deinit(a);
    const parts = try children.collect(tree, 0);
    const index = parts.line_node orelse return error.TestUnexpectedResult;
    try std.testing.expectEqual(@as(usize, 1), parts.metadata.lines.?.count());
    try std.testing.expectEqual(@as(?usize, 0), tree.nodes[index].parent);
    try std.testing.expectEqual(@as(u10, 69), tree.nodes[index].record.framing.tag);
    var markers: usize = 0;
    for (tree.nodes, 0..) |node, i| {
        if (node.record.framing.tag != 1001) continue;
        markers += 1;
        try std.testing.expectEqual(@as(?usize, index), node.parent);
        try std.testing.expectEqual(i + 1, node.subtree_end);
        try std.testing.expectEqualSlices(u8, marker, node.record.framing.payload);
    }
    try std.testing.expectEqual(@as(usize, if (has_descendant) 1 else 0), markers);
    if (has_descendant) {
        try std.testing.expect(tree.nodes[index].subtree_end > index + 1);
        try std.testing.expectError(error.UnsupportedSourceLineCache, cache.validate(tree, 0));
    } else {
        try std.testing.expectEqual(index + 1, tree.nodes[index].subtree_end);
        try cache.validate(tree, 0);
    }
}

fn expectWrite(a: std.mem.Allocator, bytes: []const u8, expected: []const u8) !void {
    const output = try cache.write(a, bytes, version, limit);
    defer a.free(output);
    try std.testing.expectEqualSlices(u8, expected, output);
}

fn expectRefusal(a: std.mem.Allocator, bytes: []const u8, expected: anyerror) !void {
    const output = cache.write(a, bytes, version, limit) catch |err| {
        if (err == error.OutOfMemory) return err;
        try std.testing.expectEqual(expected, err);
        return;
    };
    defer a.free(output);
    return error.TestExpectedError;
}

test "line cache leaf proof known direct caches exact retirement and allocation failures" {
    const a = std.testing.allocator;
    for ([_]Order{ .before_runs, .after_runs }) |order| {
        const bytes = try input(a, order, .leaf);
        defer a.free(bytes);
        const before = try a.dupe(u8, bytes);
        defer a.free(before);
        const expected = try input(a, order, .none);
        defer a.free(expected);
        try verifyAssociation(a, bytes, false);
        try @import("../../testing/allocation_failures.zig").check(expectWrite, .{ bytes, expected });
        try std.testing.expectEqualSlices(u8, before, bytes);
    }
}

test "line cache leaf proof rejects opaque descendant before retirement" {
    const a = std.testing.allocator;
    for ([_]Order{ .before_runs, .after_runs }) |order| {
        const bytes = try input(a, order, .opaque_child);
        defer a.free(bytes);
        const before = try a.dupe(u8, bytes);
        defer a.free(before);
        try verifyAssociation(a, bytes, true);
        try @import("../../testing/allocation_failures.zig").check(expectRefusal, .{ bytes, @as(anyerror, error.UnsupportedSourceLineCache) });
        try std.testing.expectEqualSlices(u8, before, bytes);
    }
}

test "line cache leaf proof duplicate association retains error priority" {
    const a = std.testing.allocator;
    for ([_]Order{ .before_runs, .after_runs }) |order| {
        const bytes = try input(a, order, .duplicate_opaque);
        defer a.free(bytes);
        const before = try a.dupe(u8, bytes);
        defer a.free(before);
        var tree = try source.parse(a, bytes, version, .{});
        defer tree.deinit(a);
        try std.testing.expectError(error.DuplicateParagraphRecord, children.collect(tree, 0));
        try @import("../../testing/allocation_failures.zig").check(expectRefusal, .{ bytes, @as(anyerror, error.DuplicateParagraphRecord) });
        try std.testing.expectEqualSlices(u8, before, bytes);
    }
}
