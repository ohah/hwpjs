//! Source-only ABI probes: independent little-endian fixtures, no document/session fixture.
const std = @import("std");
const t = std.testing;
const a = t.allocator;
const Format = @import("model/document.zig").Format;
const p = @import("model/border_fill_patch.zig");
const fill = @import("wasm/cell_fill_batch.zig");
const style = @import("wasm/cell_style_batch.zig");

// Literal ABI layouts intentionally do not depend on decoder strides/serializers.
fn bytes(comptime n: usize, words: [n]u32) [n * 4]u8 {
    var out: [n * 4]u8 = undefined;
    for (words, 0..) |scalar, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], scalar, .little);
    return out;
}
fn border(mask: u32, line: u32, width: u32, color: u32) [32]u8 {
    return bytes(8, .{ 7, 20, 21, 5, mask, line, width, color });
}
fn background(kind: u32, fields: [8]u32) [48]u8 {
    return bytes(12, .{ 7, 20, 21, kind, fields[0], fields[1], fields[2], fields[3], fields[4], fields[5], fields[6], fields[7] });
}
fn word(row: []u8, index: usize, value: u32) void {
    std.mem.writeInt(u32, row[index * 4 ..][0..4], value, .little);
}
fn expectFillError(comptime format: Format, expected: anyerror, row: []const u8) !void {
    try t.expectError(expected, fill.build(format, a, row));
}
fn expectBorderError(comptime format: Format, expected: anyerror, row: []const u8) !void {
    try t.expectError(expected, style.buildBorders(format, a, row));
}

test "cell style wire presence bits preserve explicit NONE black and absent scalars in both formats" {
    inline for (.{ Format.hwp5, Format.hwpx }) |format| {
        for (@as(u32, 1)..8) |mask_value| {
            const mask: u32 = @intCast(mask_value);
            const input = border(mask, 0, if (mask & 2 != 0) 70 else 0, 0);
            const rows = try style.buildBorders(format, a, &input);
            defer a.free(rows);
            try t.expectEqual(@as(usize, 1), rows.len);
            const expected: p.Edge = .{
                .style = if (mask & 1 != 0) .NONE else null,
                .width_hundredth_mm = if (mask & 2 != 0) 70 else null,
                .color = if (mask & 4 != 0) 0 else null,
            };
            try t.expectEqual(@as(usize, 7), rows[0].section);
            try t.expectEqual(@as(u32, 20), rows[0].table_node);
            try t.expectEqual(@as(u32, 21), rows[0].list_node);
            try t.expectEqualDeep(expected, rows[0].patch.border.edges[0].?);
            try t.expectEqualDeep(expected, rows[0].patch.border.edges[2].?);
            try t.expectEqual(@as(?p.Edge, null), rows[0].patch.border.edges[1]);
            try t.expectEqual(@as(?p.Edge, null), rows[0].patch.border.edges[3]);
            try t.expectEqual(@as(?p.Background, null), rows[0].patch.background);
        }
    }
}

test "cell style wire canonical border enums and RGB keep byte order independent of HWP5 raw domain" {
    inline for (.{ Format.hwp5, Format.hwpx }) |format| {
        for ([_]p.Style{ .NONE, .SOLID, .DOUBLE_SLIM }, 0..) |expected, code| {
            const input = border(7, @intCast(code), 10, 0x123456);
            const rows = try style.buildBorders(format, a, &input);
            defer a.free(rows);
            try t.expectEqual(expected, rows[0].patch.border.edges[0].?.style.?);
            try t.expectEqual(@as(u32, 0x123456), rows[0].patch.border.edges[0].?.color.?);
        }
        const input = border(4, 0, 0, 0xffffff);
        const rows = try style.buildBorders(format, a, &input);
        defer a.free(rows);
        try t.expectEqual(@as(u32, 0xffffff), rows[0].patch.border.edges[0].?.color.?);
        try expectBorderError(format, error.InvalidCharacterColor, &border(4, 0, 0, 0x1000000));
        try expectBorderError(format, error.UnsupportedCellBorderStyle, &border(1, 8, 0, 0));
    }
}

test "cell style wire sparse holes and malformed byte lengths are rejected before publication" {
    inline for (.{ Format.hwp5, Format.hwpx }) |format| {
        const bad = [_][32]u8{
            border(0, 0, 0, 0), border(8, 0, 0, 0),
            border(4, 1, 0, 0), border(4, 0, 10, 0),
            border(1, 0, 0, 1),
        };
        for (bad) |row| try expectBorderError(format, error.InvalidCellBorderPatch, &row);
        var row = border(1, 0, 0, 0);
        for ([_]u32{ 0, 16, 0xffffffff }) |edges| {
            word(&row, 3, edges);
            try expectBorderError(format, error.InvalidCellBorderEdges, &row);
        }
        const oversized: [49]u8 = @splat(0);
        for ([_]usize{ 1, 31, 33 }) |len| try expectBorderError(format, error.InvalidCellBorderPatchBatch, oversized[0..len]);
        for ([_]usize{ 1, 47, 49 }) |len| try expectFillError(format, error.InvalidCellFillBatch, oversized[0..len]);
        try expectBorderError(format, error.UnsupportedBorderWidth, &border(2, 0, 11, 0));
        try expectBorderError(format, error.UnsupportedBorderWidth, &border(2, 0, 0x1000a, 0));
    }
}

test "cell style wire all four fill variants decode exact independent model values in both formats" {
    const payloads = [_][8]u32{
        @splat(0),                                 .{ 0, 0, 0, 0, 0, 0, 0, 0 },
        .{ 0x123456, 0xffffff, 2, 0, 0, 0, 0, 0 }, .{ 0, 0xffffff, 359, 0, 100, 100, 0, 0 },
    };
    const expected = [_]p.Background{
        .none,                                                                        .{ .solid = .{ .color = 0 } },
        .{ .hatch = .{ .face = 0x123456, .hatch = 0xffffff, .style = .BACK_SLASH } }, .{ .linear = .{ .colors = .{ 0, 0xffffff }, .angle = 359, .center_x = 0, .center_y = 100, .step = 100, .step_center = 0 } },
    };
    inline for (.{ Format.hwp5, Format.hwpx }) |format| {
        for (payloads, expected, 0..) |fields, want, code| {
            var input = background(@intCast(code), fields);
            const rows = try fill.build(format, a, &input);
            defer a.free(rows);
            try t.expectEqualDeep(want, rows[0].fill);
            try t.expectEqual(@as(usize, 7), rows[0].section);
            try t.expectEqual(@as(u32, 20), rows[0].table_node);
            try t.expectEqual(@as(u32, 21), rows[0].list_node);
            @memset(&input, 0xff);
            try t.expectEqualDeep(want, rows[0].fill);
        }
    }
}

test "cell style wire fill reserved words and unknown kinds are never ignored" {
    const used = [_]usize{ 0, 1, 3, 7 };
    inline for (.{ Format.hwp5, Format.hwpx }) |format| {
        for (used, 0..) |count, kind| {
            for (count..8) |slot| {
                var fields: [8]u32 = @splat(0);
                fields[slot] = 1;
                try expectFillError(format, error.InvalidCellFill, &background(@intCast(kind), fields));
            }
        }
        for ([_]u32{ 4, 0xffffffff }) |kind| try expectFillError(format, error.InvalidCellFill, &background(kind, @splat(0)));
    }
}

test "cell style wire hatch canonical codes zero through five are distinct and six is rejected" {
    const expected = [_]p.Hatch{ .HORIZONTAL, .VERTICAL, .BACK_SLASH, .SLASH, .CROSS, .CROSS_DIAGONAL };
    inline for (.{ Format.hwp5, Format.hwpx }) |format| {
        for (expected, 0..) |want, code| {
            const input = background(2, .{ 0, 0xffffff, @intCast(code), 0, 0, 0, 0, 0 });
            const rows = try fill.build(format, a, &input);
            defer a.free(rows);
            try t.expectEqual(want, rows[0].fill.hatch.style);
        }
        try expectFillError(format, error.InvalidCellFill, &background(2, .{ 0, 0, 6, 0, 0, 0, 0, 0 }));
    }
}

test "cell style wire fill RGB and each gradient bound reject overflow without narrowing" {
    inline for (.{ Format.hwp5, Format.hwpx }) |format| {
        try expectFillError(format, error.InvalidCharacterColor, &background(1, .{ 0x1000000, 0, 0, 0, 0, 0, 0, 0 }));
        for ([_]usize{ 0, 1 }) |slot| {
            var fields: [8]u32 = @splat(0);
            fields[slot] = 0x1000000;
            try expectFillError(format, error.InvalidCharacterColor, &background(2, fields));
            try expectFillError(format, error.InvalidCharacterColor, &background(3, fields));
        }
        for (2..7) |slot| {
            var fields: [8]u32 = @splat(0);
            fields[slot] = if (slot == 2) 360 else 101;
            try expectFillError(format, error.InvalidCellFill, &background(3, fields));
            fields[slot] = 0xffffffff;
            try expectFillError(format, error.InvalidCellFill, &background(3, fields));
        }
    }
}

test "cell style wire duplicate owner is section plus list even when table differs" {
    inline for (.{ Format.hwp5, Format.hwpx }) |format| {
        const b = border(4, 0, 0, 0);
        var bb = b ++ b;
        word(bb[32..], 1, 999);
        try expectBorderError(format, error.DuplicateCellBorderEdit, &bb);
        const f = background(0, @splat(0));
        var ff = f ++ f;
        word(ff[48..], 1, 999);
        try expectFillError(format, error.DuplicateCellFillEdit, &ff);
        word(bb[32..], 0, 8);
        const rows = try style.buildBorders(format, a, &bb);
        defer a.free(rows);
        try t.expectEqual(@as(usize, 2), rows.len);
    }
}

test "cell style wire same owner merges one sparse border and fill patch while disjoint owners stay separate" {
    inline for (.{ Format.hwp5, Format.hwpx }) |format| {
        const b = border(4, 0, 0, 0);
        const f = background(3, .{ 0x123456, 0xffffff, 90, 50, 50, 2, 50, 0 });
        const rows = try style.build(format, a, &b, &f);
        defer a.free(rows);
        try t.expectEqual(@as(usize, 1), rows.len);
        try t.expectEqualDeep(p.Edge{ .color = 0 }, rows[0].patch.border.edges[0].?);
        try t.expectEqual(@as(?p.Edge, null), rows[0].patch.border.edges[1]);
        try t.expectEqualDeep(p.Background{ .linear = .{ .colors = .{ 0x123456, 0xffffff }, .angle = 90, .center_x = 50, .center_y = 50, .step = 2, .step_center = 50 } }, rows[0].patch.background.?);
        var other = f;
        word(&other, 2, 22);
        const separate = try style.build(format, a, &b, &other);
        defer a.free(separate);
        try t.expectEqual(@as(usize, 2), separate.len);
        try t.expectEqual(@as(?p.Background, null), separate[0].patch.background);
        try t.expectEqualDeep(p.Border{}, separate[1].patch.border);
    }
}

test "cell style wire conflicting table for cross stream same owner rejects whole merge" {
    inline for (.{ Format.hwp5, Format.hwpx }) |format| {
        const b = border(4, 0, 0, 0);
        var f = background(0, @splat(0));
        word(&f, 1, 999);
        try t.expectError(error.AmbiguousCellStyleOwner, style.build(format, a, &b, &f));
    }
}

fn manyBorders(count: usize) ![]u8 {
    const out = try a.alloc(u8, count * 32);
    for (0..count) |i| {
        const row = border(4, 0, 0, 0);
        @memcpy(out[i * 32 ..][0..32], &row);
        word(out[i * 32 ..], 2, @intCast(i));
    }
    return out;
}
test "cell style wire combined distinct owner budget rejects 4097 but merges owner at 4096" {
    const b = try manyBorders(4096);
    defer a.free(b);
    inline for (.{ Format.hwp5, Format.hwpx }) |format| {
        var f = background(0, @splat(0));
        word(&f, 2, 4096);
        try t.expectError(error.LimitExceeded, style.build(format, a, b, &f));
        word(&f, 2, 0);
        const rows = try style.build(format, a, b, &f);
        defer a.free(rows);
        try t.expectEqual(@as(usize, 4096), rows.len);
        try t.expectEqualDeep(p.Background.none, rows[0].patch.background.?);
        const overflow = try manyBorders(4097);
        defer a.free(overflow);
        try expectBorderError(format, error.LimitExceeded, overflow);
    }
}

fn allocationProbe(comptime format: Format, allocator: std.mem.Allocator) !void {
    const b = border(7, 2, 70, 0x123456);
    const f = background(2, .{ 0, 0xffffff, 3, 0, 0, 0, 0, 0 });
    const borders = try style.buildBorders(format, allocator, &b);
    defer allocator.free(borders);
    const fills = try fill.build(format, allocator, &f);
    defer allocator.free(fills);
    const merged = try style.build(format, allocator, &b, &f);
    defer allocator.free(merged);
    var disjoint = f;
    word(&disjoint, 2, 22);
    const separate = try style.build(format, allocator, &b, &disjoint);
    defer allocator.free(separate);
    try t.expectEqual(@as(usize, 1), merged.len);
    try t.expectEqual(@as(usize, 2), separate.len);
}
fn allocationsH5(allocator: std.mem.Allocator) !void {
    try allocationProbe(.hwp5, allocator);
}
fn allocationsHX(allocator: std.mem.Allocator) !void {
    try allocationProbe(.hwpx, allocator);
}
test "cell style wire every allocation failure frees partial decode and merge buffers in both formats" {
    try t.checkAllAllocationFailures(a, allocationsH5, .{});
    try t.checkAllAllocationFailures(a, allocationsHX, .{});
}
