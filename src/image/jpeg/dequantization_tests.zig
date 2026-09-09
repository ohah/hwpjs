const std = @import("std");
const t = std.testing;
const zigzag = @import("zigzag.zig");
const dequantization = @import("dequantization.zig");
const quantization = @import("quantization.zig");

// Independent diagonal walk, not a copy of the product mapping table.
fn rasterOf(wanted: usize) usize {
    var wire: usize = 0;
    for (0..15) |diagonal| {
        const low = diagonal -| 7;
        const high = @min(diagonal, 7);
        for (0..high - low + 1) |n| {
            const row = if (diagonal % 2 == 0) high - n else low + n;
            if (wire == wanted) return row * 8 + diagonal - row;
            wire += 1;
        }
    }
    unreachable;
}

test "JPEG zigzag matches diagonal traversal at every index and bounds both directions" {
    var seen: [64]bool = @splat(false);
    for (0..64) |wire| {
        const raster = rasterOf(wire);
        try t.expectEqual(@as(u6, @intCast(raster)), zigzag.rasterIndex(wire).?);
        try t.expectEqual(@as(u6, @intCast(wire)), zigzag.wireIndex(raster).?);
        try t.expect(!seen[raster]);
        seen[raster] = true;
    }
    for ([_]usize{ 64, 65, 255, std.math.maxInt(usize) }) |n| {
        try t.expect(zigzag.rasterIndex(n) == null);
        try t.expect(zigzag.wireIndex(n) == null);
    }
}

test "JPEG dequantization preserves all impulse positions signs and unequal quantizers" {
    var wide: [129]u8 = undefined;
    var narrow: [65]u8 = undefined;
    wide[0] = 16;
    narrow[0] = 0;
    for (0..64) |i| {
        std.mem.writeInt(u16, wide[1 + i * 2 ..][0..2], @intCast(i * 997 + 1), .big);
        narrow[i + 1] = @intCast(i + 1);
    }
    for ([_][]const u8{ &narrow, &wide }) |raw| {
        var iterator = try quantization.Iterator.init(raw, .{});
        const table = (try iterator.next()).?;
        for (0..64) |wire| for ([_]i32{ std.math.minInt(i32), -32768, -1, 0, 1, 32767, std.math.maxInt(i32) }) |value| {
            var coefficients: [64]i32 = @splat(0);
            coefficients[wire] = value;
            const result = dequantization.block(coefficients, table);
            const q: i128 = if (raw.len == 65) wire + 1 else wire * 997 + 1;
            for (result, 0..) |actual, raster| {
                const expected: i64 = if (raster == rasterOf(wire)) @intCast(@as(i128, value) * q) else 0;
                try t.expectEqual(expected, actual);
            }
        };
    }
}

test "JPEG dequantization exhausts u16 quantizers without i32 truncation or clamping" {
    var raw: [129]u8 = undefined;
    raw[0] = 16;
    for (1..65536) |q| {
        for (0..64) |i| std.mem.writeInt(u16, raw[1 + i * 2 ..][0..2], @intCast(q), .big);
        var iterator = try quantization.Iterator.init(&raw, .{});
        const table = (try iterator.next()).?;
        for ([_]i32{ std.math.minInt(i32), std.math.maxInt(i32) }) |coefficient| {
            const values = dequantization.block(@splat(coefficient), table);
            const expected: i64 = @intCast(@as(i128, coefficient) * @as(i128, @intCast(q)));
            for (values) |value| try t.expectEqual(expected, value);
        }
    }
}
