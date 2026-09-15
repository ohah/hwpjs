const std = @import("std");
const geometry = @import("geometry.zig");

pub const header_size: usize = 32;
pub const rectangle_size: usize = 16;
pub const rectangle_type: u32 = 1;

pub const Header = struct {
    size: u32,
    region_type: u32,
    rectangle_count: u32,
    region_size: u32,
    bounds: geometry.RectL,
};

pub const RegionData = struct {
    raw: []const u8,
    header: Header,
    rectangle_bytes: []const u8,

    pub fn rectangle(self: RegionData, index: usize) !geometry.RectL {
        if (index >= self.header.rectangle_count) return error.EmfRegionRectangleIndexOutOfBounds;
        const start = index * rectangle_size;
        return geometry.parseRectL(self.rectangle_bytes[start .. start + rectangle_size]);
    }
};

pub fn parse(bytes: []const u8) !RegionData {
    if (bytes.len < header_size) return error.InvalidEmfRegionDataSize;
    const size = std.mem.readInt(u32, bytes[0..4], .little);
    if (size != header_size) return error.InvalidEmfRegionDataHeaderSize;
    const region_type = std.mem.readInt(u32, bytes[4..8], .little);
    if (region_type != rectangle_type) return error.InvalidEmfRegionDataType;
    const rectangle_count = std.mem.readInt(u32, bytes[8..12], .little);
    const region_size = std.mem.readInt(u32, bytes[12..16], .little);
    const expected_region_size = @as(u64, rectangle_count) * rectangle_size;
    if (region_size != 0 and region_size != expected_region_size) return error.InvalidEmfRegionRectangleBytes;
    const expected_size = header_size + expected_region_size;
    if (expected_size > std.math.maxInt(usize) or bytes.len != expected_size)
        return error.InvalidEmfRegionDataSize;
    return .{
        .raw = bytes,
        .header = .{
            .size = size,
            .region_type = region_type,
            .rectangle_count = rectangle_count,
            .region_size = region_size,
            .bounds = try geometry.parseRectL(bytes[16..32]),
        },
        .rectangle_bytes = bytes[header_size..],
    };
}

fn fixture(rectangle_count: u32) [64]u8 {
    var bytes = [_]u8{0} ** 64;
    std.mem.writeInt(u32, bytes[0..4], header_size, .little);
    std.mem.writeInt(u32, bytes[4..8], rectangle_type, .little);
    std.mem.writeInt(u32, bytes[8..12], rectangle_count, .little);
    std.mem.writeInt(u32, bytes[12..16], rectangle_count * @as(u32, rectangle_size), .little);
    return bytes;
}

test "RegionData preserves header bounds and indexed signed rectangles" {
    var bytes = fixture(2);
    for ([_]i32{ -10, -9, 20, 21, -8, -7, 4, 5, 6, 7, 8, 9 }, 0..) |value, index|
        std.mem.writeInt(i32, bytes[16 + index * 4 ..][0..4], value, .little);
    const value = try parse(&bytes);
    try std.testing.expectEqual(@as(u32, 2), value.header.rectangle_count);
    try std.testing.expectEqual(@as(i32, -10), value.header.bounds.left);
    try std.testing.expectEqual(@as(i32, 21), value.header.bounds.bottom);
    try std.testing.expectEqual(@as(i32, -8), (try value.rectangle(0)).left);
    try std.testing.expectEqual(@as(i32, 5), (try value.rectangle(0)).bottom);
    try std.testing.expectEqual(@as(i32, 6), (try value.rectangle(1)).left);
    try std.testing.expectEqual(@as(i32, 9), (try value.rectangle(1)).bottom);
    try std.testing.expectEqualSlices(u8, &bytes, value.raw);
    try std.testing.expectError(error.EmfRegionRectangleIndexOutOfBounds, value.rectangle(2));
}

test "RegionData requires exact header count and byte extents" {
    var empty = fixture(0);
    _ = try parse(empty[0..32]);
    try std.testing.expectError(error.InvalidEmfRegionDataSize, parse(empty[0..31]));
    try std.testing.expectError(error.InvalidEmfRegionDataSize, parse(empty[0..36]));

    var invalid = fixture(2);
    std.mem.writeInt(u32, invalid[0..4], 28, .little);
    try std.testing.expectError(error.InvalidEmfRegionDataHeaderSize, parse(&invalid));
    invalid = fixture(2);
    std.mem.writeInt(u32, invalid[4..8], 2, .little);
    try std.testing.expectError(error.InvalidEmfRegionDataType, parse(&invalid));
    invalid = fixture(2);
    std.mem.writeInt(u32, invalid[12..16], 16, .little);
    try std.testing.expectError(error.InvalidEmfRegionRectangleBytes, parse(&invalid));
    invalid = fixture(2);
    std.mem.writeInt(u32, invalid[12..16], 0, .little);
    try std.testing.expectEqual(@as(u32, 2), (try parse(&invalid)).header.rectangle_count);
    invalid = fixture(2);
    std.mem.writeInt(u32, invalid[8..12], std.math.maxInt(u32), .little);
    std.mem.writeInt(u32, invalid[12..16], 0xfffffff0, .little);
    try std.testing.expectError(error.InvalidEmfRegionRectangleBytes, parse(&invalid));
}
