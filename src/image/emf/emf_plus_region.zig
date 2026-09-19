const std = @import("std");
const binary = @import("../../binary/reader.zig");
const graphics_version = @import("emf_plus_graphics_version.zig");
const node = @import("emf_plus_region_node.zig");
const object = @import("emf_plus_object.zig");

pub const Options = struct {
    max_region_bytes: usize = 64 * 1024 * 1024,
    max_nodes: u32 = 1_000_000,
    node_options: node.Options = .{},
};

pub const Region = struct {
    bytes: []const u8,
    version: graphics_version.GraphicsVersion,
    region_node_count: u32,
    node_bytes: []const u8,
    node_options: node.Options,

    pub fn nodes(self: Region) node.Iterator {
        return .{
            .reader = .{ .bytes = self.node_bytes },
            .options = self.node_options,
            .expected_nodes = self.region_node_count + 1,
        };
    }
};

pub fn parse(bytes: []const u8, options: Options) !Region {
    if (bytes.len > options.max_region_bytes) return error.LimitExceeded;
    var reader: binary.Reader = .{ .bytes = bytes };
    const version = try graphics_version.parse(try reader.readInt(u32));
    const region_node_count = try reader.readInt(u32);
    if (region_node_count == std.math.maxInt(u32)) return error.InvalidEmfPlusRegionNodeCount;
    const total_nodes = region_node_count + 1;
    if (total_nodes > options.max_nodes) return error.LimitExceeded;
    const node_start = reader.offset;
    var iterator: node.Iterator = .{
        .reader = reader,
        .options = options.node_options,
        .expected_nodes = total_nodes,
    };
    while (try iterator.next()) |_| {}
    if (!iterator.complete) return error.InvalidEmfPlusRegionNodeCount;
    if (iterator.reader.offset != bytes.len) return error.InvalidEmfPlusRegionTrailingData;
    return .{
        .bytes = bytes,
        .version = version,
        .region_node_count = region_node_count,
        .node_bytes = bytes[node_start..],
        .node_options = options.node_options,
    };
}

pub fn parseCompleted(value: object.Completed, options: Options) !Region {
    if (value.object_type != .region) return error.NotEmfPlusRegionObject;
    return parse(value.object_data, options);
}

fn putU32(bytes: []u8, offset: usize, value: u32) void {
    std.mem.writeInt(u32, bytes[offset..][0..4], value, .little);
}

fn putF32(bytes: []u8, offset: usize, value: f32) void {
    putU32(bytes, offset, @bitCast(value));
}

test "EMF+ Region validates and iterates the complete pre-order tree" {
    var bytes = [_]u8{0} ** 36;
    putU32(&bytes, 0, 0xdbc01002);
    putU32(&bytes, 4, 2);
    putU32(&bytes, 8, 1);
    putU32(&bytes, 12, 0x1000_0000);
    for ([_]f32{ 1, 2, 3, 4 }, 0..) |value, index| putF32(&bytes, 16 + index * 4, value);
    putU32(&bytes, 32, 0x1000_0003);
    const value = try parse(&bytes, .{});
    try std.testing.expectEqual(@as(u32, 2), value.region_node_count);
    var nodes = value.nodes();
    const root = (try nodes.next()).?;
    try std.testing.expectEqual(@as(usize, 0), root.depth);
    try std.testing.expectEqual(@as(u32, 1), @intFromEnum(root.node_type));
    const left = (try nodes.next()).?;
    try std.testing.expectEqual(@as(usize, 1), left.depth);
    try std.testing.expectEqual(@as(f32, 3), left.data.rect.width);
    try std.testing.expectEqual(@as(f32, 4), left.data.rect.height);
    const right = (try nodes.next()).?;
    try std.testing.expectEqual(@as(usize, 1), right.depth);
    try std.testing.expectEqual(@as(u32, 0x1000_0003), @intFromEnum(right.node_type));
    try std.testing.expect((try nodes.next()) == null);
}

test "EMF+ Region enforces declared count shape type limits and exact end" {
    var terminal = [_]u8{0} ** 12;
    putU32(&terminal, 0, 0xdbc01001);
    putU32(&terminal, 8, 0x1000_0002);
    _ = try parse(&terminal, .{});
    _ = try parse(&terminal, .{ .max_region_bytes = terminal.len, .max_nodes = 1 });
    try std.testing.expectError(error.LimitExceeded, parse(&terminal, .{ .max_region_bytes = 11 }));
    try std.testing.expectError(error.LimitExceeded, parse(&terminal, .{ .max_nodes = 0 }));
    putU32(&terminal, 4, std.math.maxInt(u32));
    try std.testing.expectError(error.InvalidEmfPlusRegionNodeCount, parse(&terminal, .{}));
    putU32(&terminal, 4, 1);
    try std.testing.expectError(error.InvalidEmfPlusRegionNodeCount, parse(&terminal, .{}));
    putU32(&terminal, 4, 0);
    putU32(&terminal, 8, 6);
    try std.testing.expectError(error.InvalidEmfPlusRegionNodeType, parse(&terminal, .{}));

    var trailing = [_]u8{0} ** 16;
    @memcpy(trailing[0..12], &terminal);
    putU32(&trailing, 8, 0x1000_0002);
    try std.testing.expectError(error.InvalidEmfPlusRegionTrailingData, parse(&trailing, .{}));
}

test "EMF+ Region rejects early completion unfinished trees and excessive depth" {
    var early = [_]u8{0} ** 16;
    putU32(&early, 0, 0xdbc01001);
    putU32(&early, 4, 1);
    putU32(&early, 8, 0x1000_0002);
    putU32(&early, 12, 0x1000_0003);
    try std.testing.expectError(error.InvalidEmfPlusRegionNodeCount, parse(&early, .{}));

    var unfinished = early;
    putU32(&unfinished, 4, 1);
    putU32(&unfinished, 8, 1);
    putU32(&unfinished, 12, 0x1000_0002);
    try std.testing.expectError(error.InvalidEmfPlusRegionNodeCount, parse(&unfinished, .{}));
    try std.testing.expectError(error.EmfPlusRegionDepthLimitExceeded, parse(&unfinished, .{ .node_options = .{ .max_depth = 1 } }));
    try std.testing.expectError(error.InvalidEmfPlusRegionDepthLimit, parse(&early, .{ .node_options = .{ .max_depth = 0 } }));
}

test "EMF+ Region delegates an exact signed-length Path and is atomic on truncation" {
    var bytes = [_]u8{0} ** 28;
    putU32(&bytes, 0, 0xdbc01001);
    putU32(&bytes, 8, 0x1000_0001);
    putU32(&bytes, 12, 12);
    putU32(&bytes, 16, 0xdbc01001);
    const value = try parse(&bytes, .{});
    var nodes = value.nodes();
    try std.testing.expectEqual(@as(u32, 0), (try nodes.next()).?.data.path.point_count);
    for (0..bytes.len) |cut| {
        if (parse(bytes[0..cut], .{})) |_| return error.TestExpectedError else |_| {}
    }
    putU32(&bytes, 12, 0xffff_ffff);
    try std.testing.expectError(error.InvalidEmfPlusNestedPathSize, parse(&bytes, .{}));
}

test "EMF+ Region completed object type is explicit" {
    const bytes = [_]u8{ 1, 0x10, 0xc0, 0xdb, 0, 0, 0, 0, 2, 0, 0, 0x10 };
    try std.testing.expectError(error.NotEmfPlusRegionObject, parseCompleted(.{ .object_id = 0, .object_type = .path, .object_data = &bytes, .multipart = false }, .{}));
    _ = try parseCompleted(.{ .object_id = 0, .object_type = .region, .object_data = &bytes, .multipart = false }, .{});
}

test "EMF+ Region restores sibling depths after nested left and right subtrees" {
    var bytes = [_]u8{0} ** 44;
    putU32(&bytes, 0, 0xdbc01001);
    putU32(&bytes, 4, 8);
    const types = [_]u32{
        1, // root
        2, 0x1000_0002, 0x1000_0003, // left subtree
        3, 4, 0x1000_0002, 0x1000_0003, 0x1000_0002, // right subtree
    };
    for (types, 0..) |kind, index| putU32(&bytes, 8 + index * 4, kind);
    const value = try parse(&bytes, .{});
    var nodes = value.nodes();
    const depths = [_]usize{ 0, 1, 2, 2, 1, 2, 3, 3, 2 };
    for (depths, 0..) |expected, index| {
        const current = (try nodes.next()).?;
        try std.testing.expectEqual(@as(u32, @intCast(index)), current.index);
        try std.testing.expectEqual(expected, current.depth);
    }
    try std.testing.expect((try nodes.next()) == null);
}

test "EMF+ Region accepts every combine type and rejects every Rect truncation" {
    inline for (1..6) |combine| {
        var bytes = [_]u8{0} ** 20;
        putU32(&bytes, 0, 0xdbc01001);
        putU32(&bytes, 4, 2);
        putU32(&bytes, 8, combine);
        putU32(&bytes, 12, 0x1000_0002);
        putU32(&bytes, 16, 0x1000_0003);
        _ = try parse(&bytes, .{});
    }

    var rect = [_]u8{0} ** 28;
    putU32(&rect, 0, 0xdbc01001);
    putU32(&rect, 8, 0x1000_0000);
    for (0..rect.len) |cut| {
        if (parse(rect[0..cut], .{})) |_| return error.TestExpectedError else |_| {}
    }
    _ = try parse(&rect, .{});
}

test "EMF+ Region depth boundary and nested Path byte limit are exact" {
    const levels: usize = 255;
    const node_count = levels * 2 + 1;
    var bytes: [8 + node_count * 4]u8 = @splat(0);
    putU32(&bytes, 0, 0xdbc01001);
    putU32(&bytes, 4, node_count - 1);
    var offset: usize = 8;
    for (0..levels) |_| {
        putU32(&bytes, offset, 1);
        offset += 4;
    }
    putU32(&bytes, offset, 0x1000_0002);
    offset += 4;
    for (0..levels) |_| {
        putU32(&bytes, offset, 0x1000_0003);
        offset += 4;
    }
    _ = try parse(&bytes, .{});
    try std.testing.expectError(error.EmfPlusRegionDepthLimitExceeded, parse(&bytes, .{ .node_options = .{ .max_depth = 255 } }));
    try std.testing.expectError(error.InvalidEmfPlusRegionDepthLimit, parse(&bytes, .{ .node_options = .{ .max_depth = 257 } }));

    var path_bytes = [_]u8{0} ** 28;
    putU32(&path_bytes, 0, 0xdbc01001);
    putU32(&path_bytes, 8, 0x1000_0001);
    putU32(&path_bytes, 12, 12);
    putU32(&path_bytes, 16, 0xdbc01001);
    _ = try parse(&path_bytes, .{ .node_options = .{ .max_path_bytes = 12 } });
    try std.testing.expectError(error.LimitExceeded, parse(&path_bytes, .{ .node_options = .{ .max_path_bytes = 11 } }));
}
