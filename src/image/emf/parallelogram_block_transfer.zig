const std = @import("std");
const bitmap_pair = @import("bitmap_pair.zig");
const color_ref = @import("../wmf/color_ref.zig");
const destination_parallelogram = @import("destination_parallelogram.zig");
const dib_colors = @import("dib_colors.zig");
const geometry = @import("geometry.zig");
const record_extent = @import("record_extent.zig");
const records = @import("records.zig");
const xform = @import("xform.zig");

pub const fixed_size = 140;
pub const PlgBlt = struct {
    bounds: geometry.RectL,
    destination: destination_parallelogram.Parallelogram,
    source: geometry.PointL,
    source_size: geometry.SizeL,
    source_transform: xform.XForm,
    source_background: color_ref.ColorRef,
    source_usage: dib_colors.Usage,
    mask_origin: geometry.PointL,
    mask_usage: dib_colors.Usage,
    bitmaps: bitmap_pair.Pair,
    trailing_data: []const u8,
};

pub fn parse(record: records.Record) !?PlgBlt {
    if (record.kind != .plgblt) return null;
    const end = record_extent.requiredEnd(record, fixed_size) orelse return error.InvalidEmfPlgBltSize;
    const source_usage = try dib_colors.parse(std.mem.readInt(u32, record.bytes[92..96], .little));
    const mask_usage = try dib_colors.parse(std.mem.readInt(u32, record.bytes[120..124], .little));
    const pair = bitmap_pair.parse(record.bytes, end, .{
        .bmi_offset = std.mem.readInt(u32, record.bytes[96..100], .little),
        .bmi_size = std.mem.readInt(u32, record.bytes[100..104], .little),
        .bits_offset = std.mem.readInt(u32, record.bytes[104..108], .little),
        .bits_size = std.mem.readInt(u32, record.bytes[108..112], .little),
    }, source_usage, .{
        .bmi_offset = std.mem.readInt(u32, record.bytes[124..128], .little),
        .bmi_size = std.mem.readInt(u32, record.bytes[128..132], .little),
        .bits_offset = std.mem.readInt(u32, record.bytes[132..136], .little),
        .bits_size = std.mem.readInt(u32, record.bytes[136..140], .little),
    }, mask_usage) catch |err| switch (err) {
        error.MissingEmfBitmapPairSource => return error.MissingEmfPlgBltSourceBitmap,
        error.MissingEmfBitmapPairMask => return error.MissingEmfPlgBltMaskBitmap,
        else => return err,
    };
    return .{
        .bounds = try geometry.parseRectL(record.bytes[8..24]),
        .destination = try destination_parallelogram.parse(record.bytes[24..48]),
        .source = try geometry.parsePointL(record.bytes[48..56]),
        .source_size = try geometry.parseSizeL(record.bytes[56..64]),
        .source_transform = try xform.parse(record.bytes[64..88]),
        .source_background = try color_ref.parse(record.bytes[88..92], .specified_zero),
        .source_usage = source_usage,
        .mask_origin = try geometry.parsePointL(record.bytes[112..120]),
        .mask_usage = mask_usage,
        .bitmaps = pair,
        .trailing_data = record.bytes[pair.semantic_end..],
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

fn writeCoreHeader(bytes: []u8, at: usize, bit_count: u16) void {
    std.mem.writeInt(u32, bytes[at..][0..4], 12, .little);
    std.mem.writeInt(u16, bytes[at + 4 ..][0..2], 2, .little);
    std.mem.writeInt(u16, bytes[at + 6 ..][0..2], 2, .little);
    std.mem.writeInt(u16, bytes[at + 8 ..][0..2], 1, .little);
    std.mem.writeInt(u16, bytes[at + 10 ..][0..2], bit_count, .little);
}

fn validRecord() [184]u8 {
    var bytes = [_]u8{0} ** 184;
    std.mem.writeInt(u32, bytes[92..96], @intFromEnum(dib_colors.Usage.palette_indices), .little);
    std.mem.writeInt(u32, bytes[96..100], 144, .little);
    std.mem.writeInt(u32, bytes[100..104], 12, .little);
    std.mem.writeInt(u32, bytes[104..108], 156, .little);
    std.mem.writeInt(u32, bytes[108..112], 8, .little);
    std.mem.writeInt(u32, bytes[120..124], @intFromEnum(dib_colors.Usage.palette_indices), .little);
    std.mem.writeInt(u32, bytes[124..128], 164, .little);
    std.mem.writeInt(u32, bytes[128..132], 12, .little);
    std.mem.writeInt(u32, bytes[132..136], 176, .little);
    std.mem.writeInt(u32, bytes[136..140], 8, .little);
    writeCoreHeader(&bytes, 144, 1);
    writeCoreHeader(&bytes, 164, 1);
    return bytes;
}

fn expectParseError(record: records.Record) !void {
    if (parse(record)) |_| return error.ExpectedEmfPlgBltParseError else |_| return;
}

test "PLGBLT parses destination mapping source geometry and either bitmap order" {
    var bytes = validRecord();
    for ([_]i32{ -1, -2, 3, -4, -5, 6 }, 0..) |value, index|
        std.mem.writeInt(i32, bytes[24 + index * 4 ..][0..4], value, .little);
    std.mem.writeInt(i32, bytes[48..52], -7, .little);
    std.mem.writeInt(i32, bytes[56..60], -8, .little);
    std.mem.writeInt(i32, bytes[112..116], -9, .little);
    const value = (try parse(fixture(.plgblt, &bytes))).?;
    try std.testing.expectEqual(@as(i32, -1), value.destination.upper_left.x);
    try std.testing.expectEqual(@as(i32, 3), value.destination.upper_right.x);
    try std.testing.expectEqual(@as(i32, -5), value.destination.lower_left.x);
    try std.testing.expectEqual(@as(i32, -7), value.source.x);
    try std.testing.expectEqual(@as(i32, -8), value.source_size.width);
    try std.testing.expectEqual(@as(i32, -9), value.mask_origin.x);

    var extended: [188]u8 = undefined;
    @memcpy(extended[0..184], &bytes);
    extended[184..].* = .{ 9, 8, 7, 6 };
    try std.testing.expectEqualSlices(u8, &.{ 9, 8, 7, 6 }, (try parse(fixture(.plgblt, &extended))).?.trailing_data);

    var reversed = bytes;
    std.mem.writeInt(u32, reversed[96..100], 164, .little);
    std.mem.writeInt(u32, reversed[104..108], 176, .little);
    std.mem.writeInt(u32, reversed[124..128], 144, .little);
    std.mem.writeInt(u32, reversed[132..136], 156, .little);
    try std.testing.expect((try parse(fixture(.plgblt, &reversed))).?.bitmaps.mask.start < (try parse(fixture(.plgblt, &reversed))).?.bitmaps.source.start);
}

test "PLGBLT rejects all cuts missing non-mono overlap and unrelated records" {
    try std.testing.expectEqual(@as(usize, 140), fixed_size);
    const bytes = validRecord();
    for (0..fixed_size) |cut| try std.testing.expectError(error.InvalidEmfPlgBltSize, parse(fixture(.plgblt, bytes[0..cut])));
    for (fixed_size..bytes.len) |cut| try expectParseError(fixture(.plgblt, bytes[0..cut]));
    var mismatch = fixture(.plgblt, &bytes);
    mismatch.size += 4;
    try std.testing.expectError(error.InvalidEmfPlgBltSize, parse(mismatch));
    var missing = bytes;
    @memset(missing[124..140], 0);
    try std.testing.expectError(error.MissingEmfPlgBltMaskBitmap, parse(fixture(.plgblt, &missing)));
    missing = bytes;
    @memset(missing[96..112], 0);
    try std.testing.expectError(error.MissingEmfPlgBltSourceBitmap, parse(fixture(.plgblt, &missing)));
    var non_mono = bytes;
    std.mem.writeInt(u16, non_mono[174..176], 4, .little);
    try std.testing.expectError(error.InvalidEmfMonochromeBrushBitCount, parse(fixture(.plgblt, &non_mono)));
    var overlap = bytes;
    std.mem.writeInt(u16, overlap[150..152], 6, .little);
    std.mem.writeInt(u32, overlap[108..112], 24, .little);
    try std.testing.expectError(error.OverlappingEmfBitmapPair, parse(fixture(.plgblt, &overlap)));
    try std.testing.expect((try parse(fixture(.maskblt, bytes[0..fixed_size]))) == null);
}
