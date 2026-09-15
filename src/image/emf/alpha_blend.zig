const std = @import("std");
const bitmap_source = @import("bitmap_source.zig");
const blend_function = @import("blend_function.zig");
const color_ref = @import("../wmf/color_ref.zig");
const dib_colors = @import("dib_colors.zig");
const geometry = @import("geometry.zig");
const record_extent = @import("record_extent.zig");
const records = @import("records.zig");
const xform = @import("xform.zig");

pub const fixed_size = 108;
pub const AlphaBlend = struct {
    bounds: geometry.RectL,
    destination: geometry.PointL,
    destination_size: geometry.SizeL,
    blend: blend_function.BlendFunction,
    source: geometry.PointL,
    source_transform: xform.XForm,
    source_background: color_ref.ColorRef,
    source_usage: dib_colors.Usage,
    source_size: geometry.SizeL,
    bitmap: bitmap_source.Source,
    trailing_data: []const u8,
};

pub fn parse(record: records.Record) !?AlphaBlend {
    if (record.kind != .alphablend) return null;
    const end = record_extent.requiredEnd(record, fixed_size) orelse return error.InvalidEmfAlphaBlendSize;
    const destination_size = try geometry.parseSizeL(record.bytes[32..40]);
    if (destination_size.width <= 0 or destination_size.height <= 0) return error.InvalidEmfAlphaBlendDestinationSize;
    const blend = try blend_function.parse(record.bytes[40..44]);
    const source_size = try geometry.parseSizeL(record.bytes[100..108]);
    if (source_size.width <= 0 or source_size.height <= 0) return error.InvalidEmfAlphaBlendSourceSize;
    const usage = try dib_colors.parse(std.mem.readInt(u32, record.bytes[80..84], .little));
    const bitmap = (try bitmap_source.parse(record.bytes, end, .{
        .bmi_offset = std.mem.readInt(u32, record.bytes[84..88], .little),
        .bmi_size = std.mem.readInt(u32, record.bytes[88..92], .little),
        .bits_offset = std.mem.readInt(u32, record.bytes[92..96], .little),
        .bits_size = std.mem.readInt(u32, record.bytes[96..100], .little),
    }, usage)) orelse return error.MissingEmfAlphaBlendSourceBitmap;
    if (blend.alpha_format == .source_alpha and bitmap.dib.header.bit_count != 32)
        return error.InvalidEmfAlphaBlendSourceBitCount;
    return .{
        .bounds = try geometry.parseRectL(record.bytes[8..24]),
        .destination = try geometry.parsePointL(record.bytes[24..32]),
        .destination_size = destination_size,
        .blend = blend,
        .source = try geometry.parsePointL(record.bytes[44..52]),
        .source_transform = try xform.parse(record.bytes[52..76]),
        .source_background = try color_ref.parse(record.bytes[76..80], .specified_zero),
        .source_usage = usage,
        .source_size = source_size,
        .bitmap = bitmap,
        .trailing_data = record.bytes[bitmap.semantic_end..],
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

fn sourceRecord(bit_count: u16) [164]u8 {
    var bytes = [_]u8{0} ** 164;
    std.mem.writeInt(i32, bytes[32..36], 2, .little);
    std.mem.writeInt(i32, bytes[36..40], 2, .little);
    bytes[42] = 0xff;
    bytes[43] = if (bit_count == 32) 1 else 0;
    std.mem.writeInt(u32, bytes[84..88], 108, .little);
    std.mem.writeInt(u32, bytes[88..92], 40, .little);
    std.mem.writeInt(u32, bytes[92..96], 148, .little);
    const bits_size: u32 = if (bit_count == 32) 16 else 8;
    std.mem.writeInt(u32, bytes[96..100], bits_size, .little);
    std.mem.writeInt(i32, bytes[100..104], 2, .little);
    std.mem.writeInt(i32, bytes[104..108], 2, .little);
    std.mem.writeInt(u32, bytes[108..112], 40, .little);
    std.mem.writeInt(i32, bytes[112..116], 2, .little);
    std.mem.writeInt(i32, bytes[116..120], 2, .little);
    std.mem.writeInt(u16, bytes[120..122], 1, .little);
    std.mem.writeInt(u16, bytes[122..124], bit_count, .little);
    return bytes;
}

fn expectParseError(record: records.Record) !void {
    if (parse(record)) |_| return error.ExpectedEmfAlphaBlendParseError else |_| return;
}

test "ALPHABLEND parses all fixed fields source and trailing data" {
    var bytes = sourceRecord(32);
    for ([_]i32{ -9, 10, -11, 12 }, 0..) |value, index|
        std.mem.writeInt(i32, bytes[8 + index * 4 ..][0..4], value, .little);
    std.mem.writeInt(i32, bytes[24..28], -3, .little);
    std.mem.writeInt(i32, bytes[28..32], 4, .little);
    std.mem.writeInt(i32, bytes[44..48], -5, .little);
    std.mem.writeInt(i32, bytes[48..52], 6, .little);
    std.mem.writeInt(u32, bytes[52..56], 0x3f800000, .little);
    bytes[76..80].* = .{ 1, 2, 3, 0 };
    const value = (try parse(fixture(.alphablend, &bytes))).?;
    try std.testing.expectEqual(@as(i32, -9), value.bounds.left);
    try std.testing.expectEqual(@as(i32, -3), value.destination.x);
    try std.testing.expectEqual(@as(i32, 2), value.destination_size.width);
    try std.testing.expectEqual(@as(u8, 0xff), value.blend.source_constant_alpha);
    try std.testing.expectEqual(blend_function.AlphaFormat.source_alpha, value.blend.alpha_format);
    try std.testing.expectEqual(@as(i32, -5), value.source.x);
    try std.testing.expectEqual(@as(u32, 0x3f800000), value.source_transform.m11.bits);
    try std.testing.expectEqual(@as(u8, 3), value.source_background.blue);
    try std.testing.expectEqual(@as(i32, 2), value.source_size.height);
    try std.testing.expectEqual(@as(u16, 32), value.bitmap.dib.header.bit_count);
    try std.testing.expectEqual(@as(usize, 0), value.trailing_data.len);

    var extended: [168]u8 = undefined;
    @memcpy(extended[0..164], &bytes);
    extended[164..].* = .{ 9, 8, 7, 6 };
    try std.testing.expectEqualSlices(u8, &.{ 9, 8, 7, 6 }, (try parse(fixture(.alphablend, &extended))).?.trailing_data);
}

test "ALPHABLEND enforces positive rectangles blend source and every boundary" {
    try std.testing.expectEqual(@as(usize, 108), fixed_size);
    var missing = [_]u8{0} ** fixed_size;
    std.mem.writeInt(i32, missing[32..36], 1, .little);
    std.mem.writeInt(i32, missing[36..40], 1, .little);
    std.mem.writeInt(i32, missing[100..104], 1, .little);
    std.mem.writeInt(i32, missing[104..108], 1, .little);
    try std.testing.expectError(error.MissingEmfAlphaBlendSourceBitmap, parse(fixture(.alphablend, &missing)));
    for (0..fixed_size) |cut| try std.testing.expectError(error.InvalidEmfAlphaBlendSize, parse(fixture(.alphablend, missing[0..cut])));
    var mismatch = fixture(.alphablend, &missing);
    mismatch.size += 4;
    try std.testing.expectError(error.InvalidEmfAlphaBlendSize, parse(mismatch));

    const source = sourceRecord(32);
    for (fixed_size..source.len) |cut| try expectParseError(fixture(.alphablend, source[0..cut]));
    var bad = source;
    std.mem.writeInt(i32, bad[32..36], 0, .little);
    try std.testing.expectError(error.InvalidEmfAlphaBlendDestinationSize, parse(fixture(.alphablend, &bad)));
    bad = source;
    std.mem.writeInt(i32, bad[104..108], -1, .little);
    try std.testing.expectError(error.InvalidEmfAlphaBlendSourceSize, parse(fixture(.alphablend, &bad)));
    bad = source;
    std.mem.writeInt(i32, bad[100..104], 0, .little);
    try std.testing.expectError(error.InvalidEmfAlphaBlendSourceSize, parse(fixture(.alphablend, &bad)));
    bad = source;
    bad[40] = 1;
    try std.testing.expectError(error.UnsupportedEmfBlendOperation, parse(fixture(.alphablend, &bad)));
    bad = source;
    bad[43] = 2;
    try std.testing.expectError(error.UnsupportedEmfAlphaFormat, parse(fixture(.alphablend, &bad)));
    bad = source;
    bad[79] = 1;
    try std.testing.expectError(error.InvalidWmfColorReserved, parse(fixture(.alphablend, &bad)));
    var indexed = source;
    std.mem.writeInt(u32, indexed[80..84], 3, .little);
    try std.testing.expectError(error.UnsupportedEmfDibColors, parse(fixture(.alphablend, &indexed)));
    const no_alpha = sourceRecord(1);
    var constant = no_alpha;
    std.mem.writeInt(u32, constant[80..84], @intFromEnum(dib_colors.Usage.palette_indices), .little);
    try std.testing.expectEqual(blend_function.AlphaFormat.constant, (try parse(fixture(.alphablend, &constant))).?.blend.alpha_format);
    var claims_alpha = no_alpha;
    claims_alpha[43] = 1;
    std.mem.writeInt(u32, claims_alpha[80..84], @intFromEnum(dib_colors.Usage.palette_indices), .little);
    try std.testing.expectError(error.InvalidEmfAlphaBlendSourceBitCount, parse(fixture(.alphablend, &claims_alpha)));
    var incomplete = source;
    @memset(incomplete[96..100], 0);
    try std.testing.expectError(error.IncompleteEmfBitmapSource, parse(fixture(.alphablend, &incomplete)));
    var before_fixed = source;
    std.mem.writeInt(u32, before_fixed[84..88], 104, .little);
    try std.testing.expectError(error.InvalidEmfBitmapSourceExtent, parse(fixture(.alphablend, &before_fixed)));
    try std.testing.expect((try parse(fixture(.stretchblt, source[0..fixed_size]))) == null);
}
