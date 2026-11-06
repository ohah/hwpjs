//! Independent fixed-layout diagonal and three-array admission probes; no fixtures.
const std = @import("std");
const t = std.testing;
const a = t.allocator;
const Format = @import("model/document.zig").Format;
const p = @import("model/border_fill_patch.zig");
const diagonal = @import("wasm/cell_diagonal_batch.zig");
const styles = @import("wasm/cell_style_batch.zig");
fn encoded(comptime n: usize, fields: [n]u32) [n * 4]u8 {
    var out: [n * 4]u8 = undefined;
    for (fields, 0..) |scalar, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], scalar, .little);
    return out;
}
fn diag(mask: u32, dirs: u32, line: u32, width: u32, color: u32) [48]u8 {
    return encoded(12, .{ 7, 20, 21, mask, dirs, line, width, color, 0, 0, 0, 0 });
}
fn border() [32]u8 {
    return encoded(8, .{ 7, 20, 21, 5, 4, 0, 0, 0 });
}
fn fill() [48]u8 {
    return encoded(12, .{ 7, 20, 21, 1, 0, 0, 0, 0, 0, 0, 0, 0 });
}
fn word(row: []u8, index: usize, value: u32) void {
    std.mem.writeInt(u32, row[index * 4 ..][0..4], value, .little);
}
fn invalid(comptime format: Format, err: anyerror, row: []const u8) !void {
    try t.expectError(err, diagonal.build(format, a, row));
}

test "cell diagonal wire masks one through fifteen retain NONE black zero and every omitted scalar" {
    inline for (.{ Format.hwp5, Format.hwpx }) |format| {
        for (1..16) |number| {
            const mask: u32 = @intCast(number);
            const input = diag(mask, 0, 0, if (mask & 4 != 0) 70 else 0, 0);
            const rows = try diagonal.build(format, a, &input);
            defer a.free(rows);
            try t.expectEqual(@as(usize, 1), rows.len);
            try t.expectEqual(@as(usize, 7), rows[0].section);
            try t.expectEqual(@as(u32, 20), rows[0].table_node);
            try t.expectEqual(@as(u32, 21), rows[0].list_node);
            const expected: p.DiagonalPatch = .{
                .directions = if (mask & 1 != 0) .none else null,
                .stroke = .{ .style = if (mask & 2 != 0) .NONE else null, .width_hundredth_mm = if (mask & 4 != 0) 70 else null, .color = if (mask & 8 != 0) 0 else null },
            };
            try t.expectEqualDeep(expected, rows[0].patch.diagonal.?);
            try t.expectEqualDeep(p.Border{}, rows[0].patch.border);
            try t.expect(rows[0].patch.background == null);
        }
    }
}

test "cell diagonal wire four canonical directions three styles and RGB byte order are owned" {
    const dirs = [_]p.DiagonalDirections{ .none, .rising, .falling, .cross };
    const lines = [_]p.Style{ .NONE, .SOLID, .DOUBLE_SLIM };
    inline for (.{ Format.hwp5, Format.hwpx }) |format| {
        for (dirs, 0..) |direction, d| for (lines, 0..) |line, s| {
            var input = diag(15, @intCast(d), @intCast(s), 50, 0x123456);
            const rows = try diagonal.build(format, a, &input);
            defer a.free(rows);
            @memset(&input, 0xff);
            try t.expectEqualDeep(p.DiagonalPatch{ .directions = direction, .stroke = .{ .style = line, .width_hundredth_mm = 50, .color = 0x123456 } }, rows[0].patch.diagonal.?);
        };
        const input = diag(8, 0, 0, 0, 0xffffff);
        const rows = try diagonal.build(format, a, &input);
        defer a.free(rows);
        try t.expectEqual(@as(?u32, 0xffffff), rows[0].patch.diagonal.?.stroke.color);
    }
}

test "cell diagonal wire reserved words invalid masks and absent nonzero fields are rejected" {
    inline for (.{ Format.hwp5, Format.hwpx }) |format| {
        for ([_]u32{ 0, 16, 0xffffffff }) |mask| try invalid(format, error.InvalidCellDiagonal, &diag(mask, 0, 0, 0, 0));
        for (8..12) |slot| {
            var input = diag(1, 0, 0, 0, 0);
            word(&input, slot, 1);
            try invalid(format, error.InvalidCellDiagonal, &input);
        }
        for (0..4) |bit| {
            const mask = 15 ^ (@as(u32, 1) << @intCast(bit));
            var input = diag(mask, 0, 0, if (mask & 4 != 0) 10 else 0, 0);
            word(&input, 4 + bit, 1);
            try invalid(format, error.InvalidCellDiagonal, &input);
        }
    }
}

test "cell diagonal wire direction style width and RGB ranges reject overflow without truncation" {
    inline for (.{ Format.hwp5, Format.hwpx }) |format| {
        for ([_]u32{ 4, 0xffffffff }) |dirs| try invalid(format, error.InvalidCellDiagonal, &diag(1, dirs, 0, 0, 0));
        for ([_]u32{ 3, 8, 0xffffffff }) |line| try invalid(format, error.UnsupportedCellBorderStyle, &diag(2, 0, line, 0, 0));
        for ([_]u32{ 0, 11, 0x1000a, 0xffffffff }) |width| try invalid(format, error.UnsupportedBorderWidth, &diag(4, 0, 0, width, 0));
        for ([_]u32{ 0x1000000, 0xffffffff }) |color| try invalid(format, error.InvalidCharacterColor, &diag(8, 0, 0, 0, color));
    }
}

test "cell diagonal wire malformed byte lengths and zero row holes fail while empty remains empty" {
    inline for (.{ Format.hwp5, Format.hwpx }) |format| {
        const data: [97]u8 = @splat(0);
        for ([_]usize{ 1, 47, 49, 95, 97 }) |len| try invalid(format, error.InvalidCellDiagonalBatch, data[0..len]);
        const valid = diag(1, 0, 0, 0, 0);
        var hole: [96]u8 = @splat(0);
        @memcpy(hole[0..48], &valid);
        try invalid(format, error.InvalidCellDiagonal, &hole);
        const empty = try diagonal.build(format, a, &.{});
        defer a.free(empty);
        try t.expectEqual(@as(usize, 0), empty.len);
        const empty_v2 = try styles.buildV2(format, a, &.{}, &.{}, &.{});
        defer a.free(empty_v2);
        try t.expectEqual(@as(usize, 0), empty_v2.len);
    }
}

test "cell diagonal wire duplicate owner ignores table but section separates identities" {
    inline for (.{ Format.hwp5, Format.hwpx }) |format| {
        const row = diag(1, 3, 0, 0, 0);
        var input = row ++ row;
        word(input[48..], 1, 999);
        try invalid(format, error.DuplicateCellDiagonalEdit, &input);
        word(input[48..], 0, 0xffffffff);
        word(input[48..], 1, 0xffffffff);
        const values = try diagonal.build(format, a, &input);
        defer a.free(values);
        try t.expectEqual(@as(usize, 2), values.len);
        try t.expectEqual(@as(usize, 0xffffffff), values[1].section);
        try t.expectEqual(@as(u32, 0xffffffff), values[1].table_node);
    }
}

test "cell diagonal wire same owner three arrays merge exactly one independent complete patch" {
    inline for (.{ Format.hwp5, Format.hwpx }) |format| {
        const b = border();
        const f = fill();
        const d = diag(15, 2, 2, 70, 0x123456);
        const values = try styles.buildV2(format, a, &b, &f, &d);
        defer a.free(values);
        try t.expectEqual(@as(usize, 1), values.len);
        const expected: p.Patch = .{
            .border = .{ .edges = .{ .{ .color = 0 }, null, .{ .color = 0 }, null } },
            .background = .{ .solid = .{ .color = 0 } },
            .diagonal = .{ .directions = .falling, .stroke = .{ .style = .DOUBLE_SLIM, .width_hundredth_mm = 70, .color = 0x123456 } },
        };
        try t.expectEqualDeep(expected, values[0].patch);
    }
}

test "cell diagonal wire disjoint three arrays keep separate owners and sparse components" {
    inline for (.{ Format.hwp5, Format.hwpx }) |format| {
        const b = border();
        var f = fill();
        var d = diag(1, 1, 0, 0, 0);
        word(&f, 2, 22);
        word(&d, 2, 23);
        const values = try styles.buildV2(format, a, &b, &f, &d);
        defer a.free(values);
        try t.expectEqual(@as(usize, 3), values.len);
        for (values, 0..) |value, i| try t.expectEqual(@as(u32, @intCast(21 + i)), value.list_node);
        try t.expect(values[0].patch.diagonal == null and values[0].patch.background == null);
        try t.expectEqualDeep(p.Border{}, values[1].patch.border);
        try t.expect(values[1].patch.diagonal == null);
        try t.expectEqualDeep(p.Border{}, values[2].patch.border);
        try t.expect(values[2].patch.background == null);
        try t.expectEqualDeep(p.DiagonalPatch{ .directions = .rising }, values[2].patch.diagonal.?);
    }
}

test "cell diagonal wire conflicting tables between diagonal border or fill reject whole union" {
    inline for (.{ Format.hwp5, Format.hwpx }) |format| {
        const b = border();
        const f = fill();
        var d = diag(1, 1, 0, 0, 0);
        word(&d, 1, 999);
        try t.expectError(error.AmbiguousCellStyleOwner, styles.buildV2(format, a, &b, &.{}, &d));
        try t.expectError(error.AmbiguousCellStyleOwner, styles.buildV2(format, a, &.{}, &f, &d));
        try t.expectError(error.AmbiguousCellStyleOwner, styles.buildV2(format, a, &b, &f, &d));
        const repeated = d ++ d;
        try t.expectError(error.DuplicateCellDiagonalEdit, styles.buildV2(format, a, &b, &f, &repeated));
    }
}

fn many(comptime stride: usize, row: [stride]u8, count: usize, first_owner: u32) ![]u8 {
    const data = try a.alloc(u8, count * stride);
    for (0..count) |i| {
        @memcpy(data[i * stride ..][0..stride], &row);
        word(data[i * stride ..], 2, first_owner + @as(u32, @intCast(i)));
    }
    return data;
}
test "cell diagonal wire combined 4096 limit counts distinct union owners and rejects 4097" {
    const borders = try many(32, border(), 2048, 0);
    defer a.free(borders);
    const fills = try many(48, fill(), 2048, 2048);
    defer a.free(fills);
    const oversized = try many(48, diag(1, 0, 0, 0, 0), 4097, 0);
    defer a.free(oversized);
    inline for (.{ Format.hwp5, Format.hwpx }) |format| {
        try invalid(format, error.LimitExceeded, oversized);
        var d = diag(1, 3, 0, 0, 0);
        word(&d, 2, 4096);
        try t.expectError(error.LimitExceeded, styles.buildV2(format, a, borders, fills, &d));
        word(&d, 2, 0);
        const values = try styles.buildV2(format, a, borders, fills, &d);
        defer a.free(values);
        try t.expectEqual(@as(usize, 4096), values.len);
        try t.expectEqualDeep(p.DiagonalPatch{ .directions = .cross }, values[0].patch.diagonal.?);
        const exact = try many(48, diag(8, 0, 0, 0, 0), 4096, 0);
        defer a.free(exact);
        const decoded = try diagonal.build(format, a, exact);
        defer a.free(decoded);
        try t.expectEqual(@as(usize, 4096), decoded.len);
    }
}

fn allocationProbe(comptime format: Format, allocator: std.mem.Allocator) !void {
    const b = border();
    const f = fill();
    const d = diag(15, 3, 1, 70, 0);
    const decoded = try diagonal.build(format, allocator, &d);
    defer allocator.free(decoded);
    const merged = try styles.buildV2(format, allocator, &b, &f, &d);
    defer allocator.free(merged);
    var separate_f = f;
    var separate_d = d;
    word(&separate_f, 2, 22);
    word(&separate_d, 2, 23);
    const separate = try styles.buildV2(format, allocator, &b, &separate_f, &separate_d);
    defer allocator.free(separate);
    try t.expectEqual(@as(usize, 1), merged.len);
    try t.expectEqual(@as(usize, 3), separate.len);
    var bad = d ++ d;
    word(bad[48..], 2, 22);
    word(bad[48..], 11, 1);
    const rejected = diagonal.build(format, allocator, &bad) catch |err| {
        if (err == error.OutOfMemory) return err;
        try t.expect(err == error.InvalidCellDiagonal);
        return;
    };
    allocator.free(rejected);
    return error.ExpectedMalformedRowRejection;
}
fn allocationH5(allocator: std.mem.Allocator) !void {
    try allocationProbe(.hwp5, allocator);
}
fn allocationHX(allocator: std.mem.Allocator) !void {
    try allocationProbe(.hwpx, allocator);
}
test "cell diagonal wire every allocation failure cleans direct union and malformed trailing decode" {
    try t.checkAllAllocationFailures(a, allocationH5, .{});
    try t.checkAllAllocationFailures(a, allocationHX, .{});
}

test "cell diagonal wire absent third array preserves legacy two array patch exactly" {
    inline for (.{ Format.hwp5, Format.hwpx }) |format| {
        const b = border();
        const f = fill();
        const legacy = try styles.build(format, a, &b, &f);
        defer a.free(legacy);
        const v2 = try styles.buildV2(format, a, &b, &f, &.{});
        defer a.free(v2);
        try t.expectEqualDeep(legacy, v2);
        try t.expect(v2[0].patch.diagonal == null);
    }
}
