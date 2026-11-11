//! Owned display values; semantic parsing remains in the DocInfo reader.
const std = @import("std");
const info = @import("../docinfo/reader.zig");
pub const Shape = struct {
    id: u32,
    alignment: u3,
    flags: @import("../../model/paragraph_flags.zig").Value = .{},
    left: i32,
    right: i32,
    indent: i32,
    before: i32,
    after: i32,
    legacy_spacing_kind: u2,
    legacy_spacing: i32,
    modern_spacing: ?@import("../docinfo/para_shape.zig").ModernSpacing,
    heading_kind: u2 = 0,
    heading_id: u16 = 0,
    packed_heading_level: u3 = 0,
    extended_heading_level: ?u32 = null,
    heading_level: u32 = 0,
    heading_marker: u16 = 0,
};

pub fn read(a: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, expected_count: usize) ![]Shape {
    if (expected_count > 100_000) return error.LimitExceeded;
    const output = try a.alloc(Shape, expected_count);
    errdefer a.free(output);
    var iterator = try info.Iterator.init(bytes, version, .{});
    var count: usize = 0;
    var bullets: std.ArrayList(u16) = .empty;
    defer bullets.deinit(a);
    while (try iterator.next()) |record| {
        if (record.value == .bullet) {
            if (bullets.items.len < std.math.maxInt(u16))
                try bullets.append(a, characterBullet(record.value.bullet));
            continue;
        }
        if (record.value != .para_shape) continue;
        if (count >= output.len) return error.ResourceCountMismatch;
        const shape = record.value.para_shape;
        output[count] = .{ .id = @intCast(count), .alignment = @truncate(shape.attributes >> 2), .left = shape.left, .right = shape.right, .indent = shape.indent, .before = shape.before, .after = shape.after, .legacy_spacing_kind = @truncate(shape.attributes), .legacy_spacing = shape.legacy_spacing, .modern_spacing = shape.modern_spacing };
        output[count].flags = @import("paragraph_flags_payload.zig").read(shape.attributes);
        output[count].heading_kind = @truncate(shape.attributes >> 23);
        output[count].heading_id = shape.head_id;
        output[count].packed_heading_level = @truncate(shape.attributes >> 25);
        output[count].extended_heading_level = shape.level;
        output[count].heading_level = shape.effectiveLevel();
        count += 1;
    }
    if (count != output.len) return error.ResourceCountMismatch;
    for (output) |*shape| {
        if (shape.heading_kind == 3 and shape.heading_id != 0 and shape.heading_id <= bullets.items.len)
            shape.heading_marker = bullets.items[shape.heading_id - 1];
    }
    return output;
}

fn characterBullet(bullet: info.Bullet) u16 {
    const ch = bullet.character;
    if (ch <= 0x20 or (ch >= 0x7f and ch <= 0x9f) or
        (ch >= 0xd800 and ch <= 0xdfff) or bullet.extra.len != 0 or
        (bullet.check_character orelse 0) != 0) return 0;
    if (bullet.image) |image| {
        if (image.identifier != 0 or image.bin_data_id != 0 or image.brightness != 0 or
            image.contrast != 0 or image.effect != 0) return 0;
    }
    return ch;
}

fn allocationCase(a: std.mem.Allocator) !void {
    var bytes: [58]u8 = @splat(0);
    std.mem.writeInt(u32, bytes[0..4], 25 | (1 << 10) | (54 << 20), .little);
    std.mem.writeInt(u32, bytes[4..8], 3 << 2 | 2, .little);
    std.mem.writeInt(i32, bytes[16..20], -720, .little);
    std.mem.writeInt(i32, bytes[28..32], 160, .little);
    std.mem.writeInt(u32, bytes[50..54], 3, .little);
    const modern = try read(a, &bytes, .{ .raw = 0x05000205 }, 1);
    defer a.free(modern);
    try std.testing.expectEqual(@as(u3, 3), modern[0].alignment);
    try std.testing.expectEqual(@as(i32, -720), modern[0].indent);
    try std.testing.expectEqual(@as(i32, 160), modern[0].legacy_spacing);
    try std.testing.expectEqual(@as(u32, 3), modern[0].modern_spacing.?.attributes);
    try std.testing.expectEqual(@as(i32, 0), modern[0].modern_spacing.?.value);
    std.mem.writeInt(u32, bytes[0..4], 25 | (1 << 10) | (42 << 20), .little);
    const legacy = try read(a, bytes[0..46], .{ .raw = 0x05000000 }, 1);
    defer a.free(legacy);
    try std.testing.expect(legacy[0].modern_spacing == null);
    try std.testing.expectEqual(@as(u2, 2), legacy[0].legacy_spacing_kind);
}

test "HWP5 paragraph display preserves signed values and modern zero with allocation failures" {
    try @import("../../testing/allocation_failures.zig").check(allocationCase, .{});
}

test "HWP5 paragraph display rejects counts framing and truncated input" {
    var bytes: [46]u8 = @splat(0);
    std.mem.writeInt(u32, bytes[0..4], 25 | (1 << 10) | (42 << 20), .little);
    const a = std.testing.allocator;
    const version: @import("../version.zig").Version = .{ .raw = 0x05000000 };
    try std.testing.expectError(error.ResourceCountMismatch, read(a, &bytes, version, 0));
    try std.testing.expectError(error.ResourceCountMismatch, read(a, &bytes, version, 2));
    try std.testing.expectError(error.LimitExceeded, read(a, &bytes, version, 100_001));
    for (0..bytes.len) |length| {
        if (read(a, bytes[0..length], version, 1)) |unexpected| {
            a.free(unexpected);
            return error.ExpectedFailure;
        } else |_| {}
    }
    bytes[1] &= ~@as(u8, 4);
    try std.testing.expectError(error.InvalidDocInfoLevel, read(a, &bytes, version, 1));
}

test "caret heading retains the referenced character bullet and withholds non-character definitions" {
    const t = std.testing;
    var bullet: info.Bullet = .{ .head = .{ .attributes = 0, .width_adjustment = 0, .text_distance = 0, .char_shape_id = 0 }, .character = 0x25b6, .image = null, .check_character = null, .extra = &.{} };
    try t.expectEqual(@as(u16, 0x25b6), characterBullet(bullet));
    bullet.check_character = 0x2713;
    try t.expectEqual(@as(u16, 0), characterBullet(bullet));
    bullet.check_character = 0;
    bullet.image = .{ .identifier = 1, .contrast = 0, .brightness = 0, .effect = 0, .bin_data_id = 1 };
    try t.expectEqual(@as(u16, 0), characterBullet(bullet));
    bullet.image = null;
    bullet.character = 0xd800;
    try t.expectEqual(@as(u16, 0), characterBullet(bullet));

    var records: [64]u8 = @splat(0);
    std.mem.writeInt(u32, records[0..4], 24 | (1 << 10) | (14 << 20), .little);
    std.mem.writeInt(u16, records[16..18], 0x25b6, .little);
    std.mem.writeInt(u32, records[18..22], 25 | (1 << 10) | (42 << 20), .little);
    // 42 bytes after the four-byte PARA_SHAPE header require 64 bytes total.
    std.mem.writeInt(u32, records[22..26], 3 << 23, .little);
    std.mem.writeInt(u16, records[52..54], 1, .little);
    const shapes = try read(t.allocator, &records, .{ .raw = 0x05000000 }, 1);
    defer t.allocator.free(shapes);
    try t.expectEqual(@as(u16, 0x25b6), shapes[0].heading_marker);
    std.mem.writeInt(u16, records[52..54], 2, .little);
    const missing = try read(t.allocator, &records, .{ .raw = 0x05000000 }, 1);
    defer t.allocator.free(missing);
    try t.expectEqual(@as(u16, 0), missing[0].heading_marker);
}
