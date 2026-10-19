//! Owned opaque common-object tails; no padding or geometry interpretation.
const std = @import("std");
pub const Source = struct { control_node: usize, paragraph_node: usize, extra_bytes: usize, extra_hex: []u8 };

pub fn deinit(a: std.mem.Allocator, rows: []Source) void {
    for (rows) |row| a.free(row.extra_hex);
    a.free(rows);
}

fn hex(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    const result = try a.alloc(u8, try std.math.mul(usize, bytes.len, 2));
    const digits = "0123456789abcdef";
    for (bytes, 0..) |byte, index| {
        result[index * 2] = digits[byte >> 4];
        result[index * 2 + 1] = digits[byte & 15];
    }
    return result;
}

pub fn read(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version) ![]Source {
    const geometry = try @import("drawing_sources.zig").read(a, raw, version);
    defer a.free(geometry);
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    var rows: std.ArrayList(Source) = .empty;
    errdefer {
        for (rows.items) |row| a.free(row.extra_hex);
        rows.deinit(a);
    }
    for (geometry) |row| {
        const common = try @import("../body/object_common.zig").parseControl(tree.nodes[row.control_node].record.value.control_header);
        const encoded = try hex(a, common.extra);
        errdefer a.free(encoded);
        try rows.append(a, .{ .control_node = row.control_node, .paragraph_node = row.paragraph_node, .extra_bytes = common.extra.len, .extra_hex = encoded });
    }
    return rows.toOwnedSlice(a);
}

test "drawing opaque tail hex owns arbitrary bytes and survives every allocation failure" {
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            var input = [_]u8{ 0, 255, 128, 1 };
            const output = try hex(a, &input);
            defer a.free(output);
            @memset(&input, 42);
            try std.testing.expectEqualStrings("00ff8001", output);
            const empty = try hex(a, &.{});
            defer a.free(empty);
            try std.testing.expectEqualStrings("", empty);
        }
    }.run, .{});
}
