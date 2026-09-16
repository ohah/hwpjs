const binary = @import("../../binary/reader.zig");
const gradient = @import("emf_plus_gradient_data.zig");
const matrix = @import("emf_plus_transform_matrix.zig");
const brush_values = @import("emf_plus_brush_values.zig");

pub const Linear = struct {
    transform: ?matrix.TransformMatrix,
    preset_colors: ?gradient.BlendColors,
    horizontal_factors: ?gradient.BlendFactors,
    vertical_factors: ?gradient.BlendFactors,
};

pub fn readLinear(reader: *binary.Reader, flags: u32) !Linear {
    try validateLinearFlags(flags);
    var next = reader.*;
    const preset = flags & 0x04 != 0;
    const horizontal = flags & 0x08 != 0;
    const vertical = flags & 0x10 != 0;
    const result: Linear = .{
        .transform = if (flags & 0x02 != 0) try matrix.read(&next) else null,
        .preset_colors = if (preset) try gradient.readBlendColors(&next) else null,
        .vertical_factors = if (vertical) try gradient.readBlendFactors(&next) else null,
        .horizontal_factors = if (horizontal) try gradient.readBlendFactors(&next) else null,
    };
    reader.* = next;
    return result;
}

pub fn validateLinearFlags(flags: u32) !void {
    try brush_values.validateBrushDataFlags(flags);
    const preset = flags & 0x04 != 0;
    const horizontal = flags & 0x08 != 0;
    const vertical = flags & 0x10 != 0;
    if (preset and (horizontal or vertical)) return error.InvalidEmfPlusLinearGradientBlendFlags;
}

pub const Path = struct {
    transform: ?matrix.TransformMatrix,
    preset_colors: ?gradient.BlendColors,
    horizontal_factors: ?gradient.BlendFactors,
    focus_scale: ?gradient.FocusScale,
};

pub fn readPath(reader: *binary.Reader, flags: u32) !Path {
    try validatePathFlags(flags);
    var next = reader.*;
    const preset = flags & 0x04 != 0;
    const factors = flags & 0x08 != 0;
    const result: Path = .{
        .transform = if (flags & 0x02 != 0) try matrix.read(&next) else null,
        .preset_colors = if (preset) try gradient.readBlendColors(&next) else null,
        .horizontal_factors = if (factors) try gradient.readBlendFactors(&next) else null,
        .focus_scale = if (flags & 0x40 != 0) try gradient.readFocusScale(&next) else null,
    };
    reader.* = next;
    return result;
}

pub fn validatePathFlags(flags: u32) !void {
    try brush_values.validateBrushDataFlags(flags);
    const preset = flags & 0x04 != 0;
    const factors = flags & 0x08 != 0;
    if (preset and factors) return error.InvalidEmfPlusPathGradientBlendFlags;
}

test "EMF+ linear optional fields follow transform vertical horizontal wire order" {
    const std = @import("std");
    var bytes = [_]u8{0} ** 64;
    for (0..6) |index| std.mem.writeInt(u32, bytes[index * 4 ..][0..4], @bitCast(@as(f32, @floatFromInt(index + 1))), .little);
    std.mem.writeInt(u32, bytes[24..28], 2, .little);
    std.mem.writeInt(u32, bytes[32..36], @bitCast(@as(f32, 1)), .little);
    std.mem.writeInt(u32, bytes[40..44], @bitCast(@as(f32, 1)), .little);
    std.mem.writeInt(u32, bytes[44..48], 2, .little);
    std.mem.writeInt(u32, bytes[52..56], @bitCast(@as(f32, 1)), .little);
    std.mem.writeInt(u32, bytes[56..60], @bitCast(@as(f32, 1)), .little);
    var reader: binary.Reader = .{ .bytes = &bytes };
    const value = try readLinear(&reader, 0x1a);
    try std.testing.expectEqual(@as(f32, 6), value.transform.?.dy);
    try std.testing.expectEqual(@as(f32, 1), value.vertical_factors.?.position(1).?);
    try std.testing.expectEqual(@as(f32, 1), value.horizontal_factors.?.factor(0).?);
    try std.testing.expectEqual(bytes.len, reader.offset);
}

test "EMF+ path optional fields follow transform blend focus wire order" {
    const std = @import("std");
    var bytes = [_]u8{0} ** 48;
    for (0..6) |index| std.mem.writeInt(u32, bytes[index * 4 ..][0..4], @bitCast(@as(f32, @floatFromInt(index + 1))), .little);
    std.mem.writeInt(u32, bytes[24..28], 1, .little);
    std.mem.writeInt(u32, bytes[28..32], @bitCast(@as(f32, 0.5)), .little);
    std.mem.writeInt(u32, bytes[32..36], 0x44332211, .little);
    std.mem.writeInt(u32, bytes[36..40], 2, .little);
    std.mem.writeInt(u32, bytes[40..44], @bitCast(@as(f32, 0.25)), .little);
    std.mem.writeInt(u32, bytes[44..48], @bitCast(@as(f32, 0.75)), .little);
    var reader: binary.Reader = .{ .bytes = &bytes };
    const value = try readPath(&reader, 0x46);
    try std.testing.expectEqual(@as(f32, 6), value.transform.?.dy);
    try std.testing.expectEqual(@as(u32, 0x44332211), value.preset_colors.?.color(0).?.raw());
    try std.testing.expectEqual(@as(f32, 0.25), value.focus_scale.?.x);
    try std.testing.expectEqual(bytes.len, reader.offset);
}

test "EMF+ brush optional flags reject irrelevant and conflicting combinations atomically" {
    const std = @import("std");
    var reader: binary.Reader = .{ .bytes = &.{} };
    _ = try readLinear(&reader, 1);
    try std.testing.expectError(error.InvalidEmfPlusBrushDataFlags, readLinear(&reader, 0x20));
    try std.testing.expectError(error.InvalidEmfPlusLinearGradientBlendFlags, readLinear(&reader, 0x0c));
    _ = try readPath(&reader, 0x10);
    try std.testing.expectError(error.InvalidEmfPlusBrushDataFlags, readPath(&reader, 0x20));
    try std.testing.expectError(error.InvalidEmfPlusPathGradientBlendFlags, readPath(&reader, 0x0c));
    try std.testing.expectEqual(@as(usize, 0), reader.offset);
}
