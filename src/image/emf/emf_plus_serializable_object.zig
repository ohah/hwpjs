const std = @import("std");
const record = @import("emf_plus_record.zig");
const guid = @import("emf_plus_image_effect_guid.zig");
const image_effect = @import("emf_plus_image_effect.zig");

pub const SerializableObject = struct {
    flags: u16,
    object_guid: [16]u8,
    kind: guid.Kind,
    buffer: []const u8,
    effect: image_effect.Effect,
};

pub fn parse(value: record.Record) !SerializableObject {
    if (value.kind != .serializable_object) return error.NotEmfPlusSerializableObject;
    if (value.data.len < 20) return error.InvalidEmfPlusSerializableObjectSize;

    const object_guid = value.data[0..16].*;
    const buffer_size = std.mem.readInt(u32, value.data[16..20], .little);
    if (buffer_size % 4 != 0) return error.InvalidEmfPlusSerializableBufferAlignment;
    const expected_data_size = @as(u64, buffer_size) + 20;
    if (expected_data_size != value.data.len or
        expected_data_size != value.data_size or
        expected_data_size + 12 != value.size)
        return error.InvalidEmfPlusSerializableObjectSize;
    const kind = try guid.classify(object_guid);
    const buffer = value.data[20..];
    return .{
        .flags = value.flags,
        .object_guid = object_guid,
        .kind = kind,
        .buffer = buffer,
        .effect = try image_effect.parse(kind, buffer),
    };
}

fn makeRecord(bytes: []const u8, flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .serializable_object,
        .flags = flags,
        .size = @intCast(12 + bytes.len),
        .data_size = @intCast(bytes.len),
        .data = bytes,
        .bytes = &.{},
    };
}

fn writeEnvelope(bytes: []u8, object_guid: [16]u8, buffer_size: u32) void {
    bytes[0..16].* = object_guid;
    std.mem.writeInt(u32, bytes[16..20], buffer_size, .little);
}

test "EMF+ serializable object dispatches a known GUID and ignores flags" {
    var bytes = [_]u8{0} ** 28;
    writeEnvelope(&bytes, guid.brightness_contrast, 8);
    std.mem.writeInt(u32, bytes[20..24], 255, .little);
    std.mem.writeInt(u32, bytes[24..28], @bitCast(@as(i32, -100)), .little);
    const parsed = try parse(makeRecord(&bytes, 0xffff));
    try std.testing.expectEqual(@as(u16, 0xffff), parsed.flags);
    try std.testing.expectEqual(guid.Kind.brightness_contrast, parsed.kind);
    try std.testing.expectEqual(@as(i32, 255), parsed.effect.brightness_contrast.brightness);
    try std.testing.expectEqualSlices(u8, bytes[20..], parsed.buffer);
}

test "EMF+ serializable object rejects every envelope mismatch" {
    var bytes = [_]u8{0} ** 28;
    writeEnvelope(&bytes, guid.tint, 8);
    try std.testing.expectError(error.InvalidEmfPlusSerializableObjectSize, parse(makeRecord(bytes[0..19], 0)));
    std.mem.writeInt(u32, bytes[16..20], 4, .little);
    try std.testing.expectError(error.InvalidEmfPlusSerializableObjectSize, parse(makeRecord(&bytes, 0)));
    std.mem.writeInt(u32, bytes[16..20], 6, .little);
    try std.testing.expectError(error.InvalidEmfPlusSerializableBufferAlignment, parse(makeRecord(&bytes, 0)));
    std.mem.writeInt(u32, bytes[16..20], 8, .little);
    bytes[15] ^= 1;
    try std.testing.expectError(error.InvalidEmfPlusImageEffectGuid, parse(makeRecord(&bytes, 0)));
    bytes[15] ^= 1;
    var wrong_data_size = makeRecord(&bytes, 0);
    wrong_data_size.data_size -= 4;
    try std.testing.expectError(error.InvalidEmfPlusSerializableObjectSize, parse(wrong_data_size));
    var wrong_size = makeRecord(&bytes, 0);
    wrong_size.size += 4;
    try std.testing.expectError(error.InvalidEmfPlusSerializableObjectSize, parse(wrong_size));
    try std.testing.expectError(error.NotEmfPlusSerializableObject, parse(.{
        .offset = 0,
        .kind = .comment,
        .flags = 0,
        .size = 12,
        .data_size = 0,
        .data = &.{},
        .bytes = &.{},
    }));
}

test "EMF+ serializable object dispatch covers all eleven official effects" {
    const cases = [_]struct { kind: guid.Kind, object_guid: [16]u8, size: usize }{
        .{ .kind = .blur, .object_guid = guid.blur, .size = 8 },
        .{ .kind = .brightness_contrast, .object_guid = guid.brightness_contrast, .size = 8 },
        .{ .kind = .color_balance, .object_guid = guid.color_balance, .size = 12 },
        .{ .kind = .color_curve, .object_guid = guid.color_curve, .size = 12 },
        .{ .kind = .color_lookup_table, .object_guid = guid.color_lookup_table, .size = 1024 },
        .{ .kind = .color_matrix, .object_guid = guid.color_matrix, .size = 100 },
        .{ .kind = .hue_saturation_lightness, .object_guid = guid.hue_saturation_lightness, .size = 12 },
        .{ .kind = .levels, .object_guid = guid.levels, .size = 12 },
        .{ .kind = .red_eye_correction, .object_guid = guid.red_eye_correction, .size = 4 },
        .{ .kind = .sharpen, .object_guid = guid.sharpen, .size = 8 },
        .{ .kind = .tint, .object_guid = guid.tint, .size = 8 },
    };
    var bytes = [_]u8{0} ** (20 + 1024);
    for (cases) |case| {
        @memset(&bytes, 0);
        writeEnvelope(&bytes, case.object_guid, @intCast(case.size));
        const parsed = try parse(makeRecord(bytes[0 .. 20 + case.size], 0));
        try std.testing.expectEqual(case.kind, parsed.kind);
        try std.testing.expectEqual(case.size, parsed.buffer.len);
    }
}
