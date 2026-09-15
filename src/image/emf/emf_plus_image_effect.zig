const std = @import("std");
const guid = @import("emf_plus_image_effect_guid.zig");

pub const CurveAdjustment = enum(u3) { exposure, density, contrast, highlight, shadow, midtone, white_saturation, black_saturation };
pub const CurveChannel = enum(u2) { all, red, green, blue };

pub const Effect = union(guid.Kind) {
    blur: struct { radius: f32, expand_edge: bool },
    brightness_contrast: struct { brightness: i32, contrast: i32 },
    color_balance: struct { cyan_red: i32, magenta_green: i32, yellow_blue: i32 },
    color_curve: struct { adjustment: CurveAdjustment, channel: CurveChannel, intensity: i32 },
    color_lookup_table: struct { blue: []const u8, green: []const u8, red: []const u8, alpha: []const u8 },
    color_matrix: [25]f32,
    hue_saturation_lightness: struct { hue: i32, saturation: i32, lightness: i32 },
    levels: struct { highlight: i32, midtone: i32, shadow: i32 },
    red_eye_correction: struct { count: u32, areas: []const u8 },
    sharpen: struct { radius: f32, amount: f32 },
    tint: struct { hue: i32, amount: i32 },
};

pub fn parse(kind: guid.Kind, bytes: []const u8) !Effect {
    return switch (kind) {
        .blur => blk: {
            try exact(bytes, 8);
            const radius = float(bytes, 0);
            if (!std.math.isFinite(radius) or radius < 0 or radius > 255) return error.InvalidEmfPlusBlurRadius;
            const expand = uint(bytes, 4);
            if (expand > 1) return error.InvalidEmfPlusBoolean;
            break :blk .{ .blur = .{ .radius = radius, .expand_edge = expand == 1 } };
        },
        .brightness_contrast => blk: {
            try exact(bytes, 8);
            const brightness = sint(bytes, 0);
            const contrast = sint(bytes, 4);
            try between(brightness, -255, 255);
            try between(contrast, -100, 100);
            break :blk .{ .brightness_contrast = .{ .brightness = brightness, .contrast = contrast } };
        },
        .color_balance => blk: {
            try exact(bytes, 12);
            const a = sint(bytes, 0);
            const b = sint(bytes, 4);
            const c = sint(bytes, 8);
            try between(a, -100, 100);
            try between(b, -100, 100);
            try between(c, -100, 100);
            break :blk .{ .color_balance = .{ .cyan_red = a, .magenta_green = b, .yellow_blue = c } };
        },
        .color_curve => blk: {
            try exact(bytes, 12);
            const raw_adjustment = uint(bytes, 0);
            if (raw_adjustment > 7) return error.InvalidEmfPlusCurveAdjustment;
            const adjustment: CurveAdjustment = @enumFromInt(@as(u3, @intCast(raw_adjustment)));
            const raw_channel = uint(bytes, 4);
            if (raw_channel > 3) return error.InvalidEmfPlusCurveChannel;
            const intensity = sint(bytes, 8);
            switch (adjustment) {
                .exposure, .density => try between(intensity, -255, 255),
                .contrast, .highlight, .shadow, .midtone => try between(intensity, -100, 100),
                .white_saturation, .black_saturation => try between(intensity, 0, 255),
            }
            break :blk .{ .color_curve = .{
                .adjustment = adjustment,
                .channel = @enumFromInt(@as(u2, @intCast(raw_channel))),
                .intensity = intensity,
            } };
        },
        .color_lookup_table => blk: {
            try exact(bytes, 1024);
            break :blk .{ .color_lookup_table = .{
                .blue = bytes[0..256],
                .green = bytes[256..512],
                .red = bytes[512..768],
                .alpha = bytes[768..1024],
            } };
        },
        .color_matrix => blk: {
            try exact(bytes, 100);
            var matrix: [25]f32 = undefined;
            for (&matrix, 0..) |*item, i| item.* = float(bytes, i * 4);
            for ([_]usize{ 4, 9, 14, 19 }) |i|
                if (matrix[i] != 0.0) return error.InvalidEmfPlusColorMatrix;
            break :blk .{ .color_matrix = matrix };
        },
        .hue_saturation_lightness => blk: {
            try exact(bytes, 12);
            const hue = sint(bytes, 0);
            const saturation = sint(bytes, 4);
            const lightness = sint(bytes, 8);
            try between(hue, -180, 180);
            try between(saturation, -100, 100);
            try between(lightness, -100, 100);
            break :blk .{ .hue_saturation_lightness = .{ .hue = hue, .saturation = saturation, .lightness = lightness } };
        },
        .levels => blk: {
            try exact(bytes, 12);
            const highlight = sint(bytes, 0);
            const midtone = sint(bytes, 4);
            const shadow = sint(bytes, 8);
            try between(highlight, 0, 100);
            try between(midtone, -100, 100);
            try between(shadow, 0, 100);
            break :blk .{ .levels = .{ .highlight = highlight, .midtone = midtone, .shadow = shadow } };
        },
        .red_eye_correction => blk: {
            if (bytes.len < 4) return error.InvalidEmfPlusImageEffectSize;
            const signed_count = sint(bytes, 0);
            if (signed_count < 0) return error.InvalidEmfPlusRedEyeAreaCount;
            const count: u32 = @intCast(signed_count);
            const required = @as(u64, count) * 16 + 4;
            if (required != bytes.len) return error.InvalidEmfPlusImageEffectSize;
            break :blk .{ .red_eye_correction = .{ .count = count, .areas = bytes[4..] } };
        },
        .sharpen => blk: {
            try exact(bytes, 8);
            const radius = float(bytes, 0);
            const amount = float(bytes, 4);
            if (!std.math.isFinite(radius) or radius < 0 or radius > 255) return error.InvalidEmfPlusSharpenRadius;
            if (!std.math.isFinite(amount) or amount < 0 or amount > 100) return error.InvalidEmfPlusSharpenAmount;
            break :blk .{ .sharpen = .{ .radius = radius, .amount = amount } };
        },
        .tint => blk: {
            try exact(bytes, 8);
            const hue = sint(bytes, 0);
            const amount = sint(bytes, 4);
            try between(hue, -180, 180);
            try between(amount, -100, 100);
            break :blk .{ .tint = .{ .hue = hue, .amount = amount } };
        },
    };
}

fn exact(bytes: []const u8, expected: usize) !void {
    if (bytes.len != expected) return error.InvalidEmfPlusImageEffectSize;
}
fn uint(bytes: []const u8, offset: usize) u32 {
    return std.mem.readInt(u32, bytes[offset..][0..4], .little);
}
fn sint(bytes: []const u8, offset: usize) i32 {
    return @bitCast(uint(bytes, offset));
}
fn float(bytes: []const u8, offset: usize) f32 {
    return @bitCast(uint(bytes, offset));
}
fn between(value: i32, minimum: i32, maximum: i32) !void {
    if (value < minimum or value > maximum) return error.InvalidEmfPlusImageEffectValue;
}

fn putI32(bytes: []u8, offset: usize, value: i32) void {
    std.mem.writeInt(u32, bytes[offset..][0..4], @bitCast(value), .little);
}
fn putF32(bytes: []u8, offset: usize, value: f32) void {
    std.mem.writeInt(u32, bytes[offset..][0..4], @bitCast(value), .little);
}

test "EMF+ fixed image effects enforce exact sizes and MUST ranges" {
    var pair = [_]u8{0} ** 8;
    putF32(&pair, 0, 255);
    std.mem.writeInt(u32, pair[4..8], 1, .little);
    try std.testing.expect((try parse(.blur, &pair)).blur.expand_edge);
    putF32(&pair, 0, std.math.nan(f32));
    try std.testing.expectError(error.InvalidEmfPlusBlurRadius, parse(.blur, &pair));
    putF32(&pair, 0, 1);
    std.mem.writeInt(u32, pair[4..8], 2, .little);
    try std.testing.expectError(error.InvalidEmfPlusBoolean, parse(.blur, &pair));

    putI32(&pair, 0, -255);
    putI32(&pair, 4, 100);
    _ = try parse(.brightness_contrast, &pair);
    putI32(&pair, 4, 101);
    try std.testing.expectError(error.InvalidEmfPlusImageEffectValue, parse(.brightness_contrast, &pair));
    try std.testing.expectError(error.InvalidEmfPlusImageEffectSize, parse(.tint, pair[0..4]));
}

test "EMF+ color effects preserve order and conditional ranges" {
    var triple = [_]u8{0} ** 12;
    putI32(&triple, 0, -100);
    putI32(&triple, 4, 0);
    putI32(&triple, 8, 100);
    const balance = (try parse(.color_balance, &triple)).color_balance;
    try std.testing.expectEqual(@as(i32, -100), balance.cyan_red);
    try std.testing.expectEqual(@as(i32, 100), balance.yellow_blue);

    std.mem.writeInt(u32, triple[0..4], 6, .little);
    std.mem.writeInt(u32, triple[4..8], 3, .little);
    putI32(&triple, 8, 255);
    const curve = (try parse(.color_curve, &triple)).color_curve;
    try std.testing.expectEqual(CurveAdjustment.white_saturation, curve.adjustment);
    try std.testing.expectEqual(CurveChannel.blue, curve.channel);
    putI32(&triple, 8, -1);
    try std.testing.expectError(error.InvalidEmfPlusImageEffectValue, parse(.color_curve, &triple));
    std.mem.writeInt(u32, triple[0..4], 8, .little);
    try std.testing.expectError(error.InvalidEmfPlusCurveAdjustment, parse(.color_curve, &triple));
}

test "EMF+ lookup matrix and red eye effects own exact array boundaries" {
    var lookup: [1024]u8 = undefined;
    for (&lookup, 0..) |*item, i| item.* = @truncate(i);
    const tables = (try parse(.color_lookup_table, &lookup)).color_lookup_table;
    try std.testing.expectEqual(@as(u8, 0), tables.blue[0]);
    try std.testing.expectEqual(@as(u8, 255), tables.alpha[255]);

    var matrix = [_]u8{0} ** 100;
    putF32(&matrix, 96, 2);
    const parsed_matrix = (try parse(.color_matrix, &matrix)).color_matrix;
    try std.testing.expectEqual(@as(f32, 2), parsed_matrix[24]);
    for ([_]usize{ 4, 9, 14, 19 }) |index| {
        var invalid = matrix;
        putF32(&invalid, index * 4, 1);
        try std.testing.expectError(error.InvalidEmfPlusColorMatrix, parse(.color_matrix, &invalid));
    }

    var areas = [_]u8{0} ** 36;
    putI32(&areas, 0, 2);
    const red_eye = (try parse(.red_eye_correction, &areas)).red_eye_correction;
    try std.testing.expectEqual(@as(u32, 2), red_eye.count);
    try std.testing.expectEqual(@as(usize, 32), red_eye.areas.len);
    putI32(&areas, 0, -1);
    try std.testing.expectError(error.InvalidEmfPlusRedEyeAreaCount, parse(.red_eye_correction, &areas));
    putI32(&areas, 0, 1);
    try std.testing.expectError(error.InvalidEmfPlusImageEffectSize, parse(.red_eye_correction, &areas));
}

test "EMF+ remaining scalar effects preserve field order and both range endpoints" {
    var triple = [_]u8{0} ** 12;
    putI32(&triple, 0, -180);
    putI32(&triple, 4, 100);
    putI32(&triple, 8, -100);
    const hsl = (try parse(.hue_saturation_lightness, &triple)).hue_saturation_lightness;
    try std.testing.expectEqual(@as(i32, -180), hsl.hue);
    try std.testing.expectEqual(@as(i32, 100), hsl.saturation);

    putI32(&triple, 0, 100);
    putI32(&triple, 4, -100);
    putI32(&triple, 8, 0);
    const level = (try parse(.levels, &triple)).levels;
    try std.testing.expectEqual(@as(i32, 100), level.highlight);
    try std.testing.expectEqual(@as(i32, -100), level.midtone);
    try std.testing.expectEqual(@as(i32, 0), level.shadow);

    var pair = [_]u8{0} ** 8;
    putF32(&pair, 0, 255);
    putF32(&pair, 4, 100);
    const sharp = (try parse(.sharpen, &pair)).sharpen;
    try std.testing.expectEqual(@as(f32, 255), sharp.radius);
    putF32(&pair, 0, -1);
    try std.testing.expectError(error.InvalidEmfPlusSharpenRadius, parse(.sharpen, &pair));
    putF32(&pair, 0, 256);
    try std.testing.expectError(error.InvalidEmfPlusSharpenRadius, parse(.sharpen, &pair));
    putF32(&pair, 0, 1);
    putF32(&pair, 4, 101);
    try std.testing.expectError(error.InvalidEmfPlusSharpenAmount, parse(.sharpen, &pair));

    putI32(&pair, 0, 180);
    putI32(&pair, 4, -100);
    const tint_value = (try parse(.tint, &pair)).tint;
    try std.testing.expectEqual(@as(i32, 180), tint_value.hue);
    try std.testing.expectEqual(@as(i32, -100), tint_value.amount);
}

test "EMF+ every image effect rejects shorter and longer parameter blocks" {
    const cases = [_]struct { kind: guid.Kind, size: usize }{
        .{ .kind = .blur, .size = 8 },
        .{ .kind = .brightness_contrast, .size = 8 },
        .{ .kind = .color_balance, .size = 12 },
        .{ .kind = .color_curve, .size = 12 },
        .{ .kind = .color_lookup_table, .size = 1024 },
        .{ .kind = .color_matrix, .size = 100 },
        .{ .kind = .hue_saturation_lightness, .size = 12 },
        .{ .kind = .levels, .size = 12 },
        .{ .kind = .red_eye_correction, .size = 4 },
        .{ .kind = .sharpen, .size = 8 },
        .{ .kind = .tint, .size = 8 },
    };
    var bytes = [_]u8{0} ** 1028;
    for (cases) |case| {
        _ = try parse(case.kind, bytes[0..case.size]);
        try std.testing.expectError(error.InvalidEmfPlusImageEffectSize, parse(case.kind, bytes[0 .. case.size - 4]));
        try std.testing.expectError(error.InvalidEmfPlusImageEffectSize, parse(case.kind, bytes[0 .. case.size + 4]));
    }
}

test "EMF+ scalar image effects reject each independent out of range field" {
    var triple = [_]u8{0} ** 12;
    for (0..3) |field| {
        @memset(&triple, 0);
        putI32(&triple, field * 4, 101);
        try std.testing.expectError(error.InvalidEmfPlusImageEffectValue, parse(.color_balance, &triple));
    }
    putI32(&triple, 0, 181);
    try std.testing.expectError(error.InvalidEmfPlusImageEffectValue, parse(.hue_saturation_lightness, &triple));
    @memset(&triple, 0);
    putI32(&triple, 4, -101);
    try std.testing.expectError(error.InvalidEmfPlusImageEffectValue, parse(.hue_saturation_lightness, &triple));
    @memset(&triple, 0);
    putI32(&triple, 0, -1);
    try std.testing.expectError(error.InvalidEmfPlusImageEffectValue, parse(.levels, &triple));
    @memset(&triple, 0);
    putI32(&triple, 8, 101);
    try std.testing.expectError(error.InvalidEmfPlusImageEffectValue, parse(.levels, &triple));

    var pair = [_]u8{0} ** 8;
    putI32(&pair, 0, -181);
    try std.testing.expectError(error.InvalidEmfPlusImageEffectValue, parse(.tint, &pair));
    putI32(&pair, 0, 0);
    putI32(&pair, 4, 101);
    try std.testing.expectError(error.InvalidEmfPlusImageEffectValue, parse(.tint, &pair));
    putF32(&pair, 0, 1);
    putF32(&pair, 4, std.math.inf(f32));
    try std.testing.expectError(error.InvalidEmfPlusSharpenAmount, parse(.sharpen, &pair));

    @memset(&triple, 0);
    std.mem.writeInt(u32, triple[4..8], 4, .little);
    try std.testing.expectError(error.InvalidEmfPlusCurveChannel, parse(.color_curve, &triple));
}
