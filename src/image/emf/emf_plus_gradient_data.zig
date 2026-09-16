const std = @import("std");
const binary = @import("../../binary/reader.zig");
const argb = @import("emf_plus_argb.zig");
const values = @import("emf_plus_values.zig");

pub const BlendColors = struct {
    position_count: u32,
    positions: []const u8,
    colors: []const u8,

    pub fn position(self: BlendColors, index: u32) ?f32 {
        if (index >= self.position_count) return null;
        return values.floatAt(self.positions, index);
    }

    pub fn color(self: BlendColors, index: u32) ?argb.Argb {
        if (index >= self.position_count) return null;
        const offset = @as(usize, index) * 4;
        return argb.Argb.fromRaw(std.mem.readInt(u32, self.colors[offset..][0..4], .little));
    }
};

pub const BlendFactors = struct {
    position_count: u32,
    positions: []const u8,
    factors: []const u8,

    pub fn position(self: BlendFactors, index: u32) ?f32 {
        if (index >= self.position_count) return null;
        return values.floatAt(self.positions, index);
    }

    pub fn factor(self: BlendFactors, index: u32) ?f32 {
        if (index >= self.position_count) return null;
        return values.floatAt(self.factors, index);
    }
};

pub const FocusScale = struct { x: f32, y: f32 };

pub fn readBlendColors(reader: *binary.Reader) !BlendColors {
    var next = reader.*;
    const count = try next.readInt(u32);
    const byte_count = try arrayByteCount(&next, count);
    const positions = try next.take(byte_count);
    const colors = try next.take(byte_count);
    try validateUnitValues(positions, count);
    const result: BlendColors = .{ .position_count = count, .positions = positions, .colors = colors };
    reader.* = next;
    return result;
}

pub fn readBlendFactors(reader: *binary.Reader) !BlendFactors {
    var next = reader.*;
    const count = try next.readInt(u32);
    if (count < 2) return error.InvalidEmfPlusBlendFactorCount;
    const byte_count = try arrayByteCount(&next, count);
    const positions = try next.take(byte_count);
    const factors = try next.take(byte_count);
    try validateUnitValues(positions, count);
    try validateUnitValues(factors, count);
    if (values.floatAt(positions, 0) != 0.0 or values.floatAt(positions, count - 1) != 1.0)
        return error.InvalidEmfPlusBlendFactorEndpoints;
    const result: BlendFactors = .{ .position_count = count, .positions = positions, .factors = factors };
    reader.* = next;
    return result;
}

pub fn readFocusScale(reader: *binary.Reader) !FocusScale {
    var next = reader.*;
    if (try next.readInt(u32) != 2) return error.InvalidEmfPlusFocusScaleCount;
    const x = try values.readFloat(&next);
    const y = try values.readFloat(&next);
    if (!(x > 0.0 and x < 1.0) or !(y > 0.0 and y < 1.0))
        return error.InvalidEmfPlusFocusScale;
    const result: FocusScale = .{ .x = x, .y = y };
    reader.* = next;
    return result;
}

fn validateUnitValues(bytes: []const u8, count: u32) !void {
    for (0..@as(usize, count)) |index| {
        const value = values.floatAt(bytes, index);
        if (!(value >= 0.0 and value <= 1.0)) return error.InvalidEmfPlusBlendValue;
    }
}

fn arrayByteCount(reader: *const binary.Reader, count: u32) !usize {
    const one_array = @as(u64, count) * 4;
    const required = one_array * 2;
    if (required > reader.bytes.len - reader.offset) return error.UnexpectedEnd;
    return @intCast(one_array);
}

fn putFloat(bytes: []u8, offset: usize, value: f32) void {
    std.mem.writeInt(u32, bytes[offset..][0..4], @bitCast(value), .little);
}

test "EMF+ blend colors allow every count and borrow exact arrays" {
    var empty = [_]u8{0} ** 4;
    var empty_reader: binary.Reader = .{ .bytes = &empty };
    const zero = try readBlendColors(&empty_reader);
    try std.testing.expectEqual(@as(u32, 0), zero.position_count);
    try std.testing.expectEqual(@as(usize, 4), empty_reader.offset);

    var bytes = [_]u8{0} ** 20;
    std.mem.writeInt(u32, bytes[0..4], 2, .little);
    putFloat(&bytes, 4, 0.75);
    putFloat(&bytes, 8, 0.25);
    bytes[12..20].* = .{ 1, 2, 3, 4, 5, 6, 7, 8 };
    var reader: binary.Reader = .{ .bytes = &bytes };
    const value = try readBlendColors(&reader);
    try std.testing.expectEqualSlices(u8, bytes[4..12], value.positions);
    try std.testing.expectEqualSlices(u8, bytes[12..20], value.colors);
    try std.testing.expectEqual(@as(f32, 0.75), value.position(0).?);
    try std.testing.expectEqual(@as(u32, 0x04030201), value.color(0).?.raw());
    try std.testing.expect(value.position(2) == null);
    try std.testing.expect(value.color(2) == null);
    try std.testing.expectEqual(bytes.len, reader.offset);

    putFloat(&bytes, 8, std.math.nan(f32));
    reader.offset = 0;
    try std.testing.expectError(error.InvalidEmfPlusBlendValue, readBlendColors(&reader));
    try std.testing.expectEqual(@as(usize, 0), reader.offset);

    for (4..20) |cut| {
        var short_reader: binary.Reader = .{ .bytes = bytes[0..cut] };
        try std.testing.expectError(error.UnexpectedEnd, readBlendColors(&short_reader));
        try std.testing.expectEqual(@as(usize, 0), short_reader.offset);
    }
}

test "EMF+ blend factors enforce MUST rules but not advisory ordering" {
    var bytes = [_]u8{0} ** 28;
    std.mem.writeInt(u32, bytes[0..4], 3, .little);
    putFloat(&bytes, 4, 0.0);
    putFloat(&bytes, 8, 0.75);
    putFloat(&bytes, 12, 1.0);
    putFloat(&bytes, 16, 1.0);
    putFloat(&bytes, 20, 0.25);
    putFloat(&bytes, 24, 0.0);
    var reader: binary.Reader = .{ .bytes = &bytes };
    const value = try readBlendFactors(&reader);
    try std.testing.expectEqual(@as(f32, 0.75), value.position(1).?);
    try std.testing.expectEqual(@as(f32, 0.25), value.factor(1).?);
    try std.testing.expect(value.position(3) == null);
    try std.testing.expect(value.factor(3) == null);

    putFloat(&bytes, 8, 0.0);
    reader.offset = 0;
    _ = try readBlendFactors(&reader);
    putFloat(&bytes, 4, 0.1);
    reader.offset = 0;
    try std.testing.expectError(error.InvalidEmfPlusBlendFactorEndpoints, readBlendFactors(&reader));
    try std.testing.expectEqual(@as(usize, 0), reader.offset);
}

test "EMF+ gradient arrays reject truncation non-unit and non-finite values atomically" {
    var bytes = [_]u8{0} ** 20;
    std.mem.writeInt(u32, bytes[0..4], 2, .little);
    putFloat(&bytes, 4, 0.0);
    putFloat(&bytes, 8, 1.0);
    putFloat(&bytes, 12, 0.0);
    putFloat(&bytes, 16, 1.0);
    for (4..bytes.len) |cut| {
        var reader: binary.Reader = .{ .bytes = bytes[0..cut] };
        try std.testing.expectError(error.UnexpectedEnd, readBlendFactors(&reader));
        try std.testing.expectEqual(@as(usize, 0), reader.offset);
    }
    for ([_]f32{ -0.01, 1.01, std.math.inf(f32), std.math.nan(f32) }) |invalid| {
        putFloat(&bytes, 16, invalid);
        var reader: binary.Reader = .{ .bytes = &bytes };
        try std.testing.expectError(error.InvalidEmfPlusBlendValue, readBlendFactors(&reader));
        try std.testing.expectEqual(@as(usize, 0), reader.offset);
    }
    std.mem.writeInt(u32, bytes[0..4], 1, .little);
    var reader: binary.Reader = .{ .bytes = &bytes };
    try std.testing.expectError(error.InvalidEmfPlusBlendFactorCount, readBlendFactors(&reader));
    try std.testing.expectEqual(@as(usize, 0), reader.offset);

    var huge = [_]u8{0} ** 4;
    std.mem.writeInt(u32, &huge, std.math.maxInt(u32), .little);
    var huge_reader: binary.Reader = .{ .bytes = &huge };
    try std.testing.expectError(error.UnexpectedEnd, readBlendColors(&huge_reader));
    try std.testing.expectEqual(@as(usize, 0), huge_reader.offset);
}

test "EMF+ focus scale enforces count and exclusive finite range" {
    var bytes = [_]u8{0} ** 12;
    std.mem.writeInt(u32, bytes[0..4], 2, .little);
    putFloat(&bytes, 4, 0.25);
    putFloat(&bytes, 8, 0.75);
    var reader: binary.Reader = .{ .bytes = &bytes };
    const value = try readFocusScale(&reader);
    try std.testing.expectEqual(@as(f32, 0.25), value.x);
    try std.testing.expectEqual(@as(f32, 0.75), value.y);
    for ([_]f32{ 0.0, 1.0, -0.1, 1.1, std.math.inf(f32), std.math.nan(f32) }) |invalid| {
        putFloat(&bytes, 8, invalid);
        reader.offset = 0;
        try std.testing.expectError(error.InvalidEmfPlusFocusScale, readFocusScale(&reader));
        try std.testing.expectEqual(@as(usize, 0), reader.offset);
    }
    std.mem.writeInt(u32, bytes[0..4], 1, .little);
    reader.offset = 0;
    try std.testing.expectError(error.InvalidEmfPlusFocusScaleCount, readFocusScale(&reader));

    std.mem.writeInt(u32, bytes[0..4], 2, .little);
    for (0..12) |cut| {
        var short_reader: binary.Reader = .{ .bytes = bytes[0..cut] };
        try std.testing.expectError(error.UnexpectedEnd, readFocusScale(&short_reader));
        try std.testing.expectEqual(@as(usize, 0), short_reader.offset);
    }
}
