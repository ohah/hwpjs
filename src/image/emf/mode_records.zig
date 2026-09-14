const std = @import("std");
const records = @import("records.zig");

pub const MapMode = enum(u32) {
    text = 1,
    lometric = 2,
    himetric = 3,
    loenglish = 4,
    hienglish = 5,
    twips = 6,
    isotropic = 7,
    anisotropic = 8,
};

pub const BackgroundMode = enum(u32) {
    transparent = 1,
    opaque_background = 2,
};

pub const PolygonFillMode = enum(u32) {
    alternate = 1,
    winding = 2,
};

pub const BinaryRasterOperation = enum(u32) {
    black = 1,
    not_merge_pen = 2,
    mask_not_pen = 3,
    not_copy_pen = 4,
    mask_pen_not = 5,
    not = 6,
    xor_pen = 7,
    not_mask_pen = 8,
    mask_pen = 9,
    not_xor_pen = 10,
    nop = 11,
    merge_not_pen = 12,
    copy_pen = 13,
    merge_pen_not = 14,
    merge_pen = 15,
    white = 16,
};

pub const StretchMode = enum(u32) {
    and_scans = 1,
    or_scans = 2,
    delete_scans = 3,
    halftone = 4,
};

pub const Stretch = struct {
    raw: u32,
    known: ?StretchMode,
};

pub const ArcDirection = enum(u32) {
    counterclockwise = 1,
    clockwise = 2,
};

pub const Value = union(enum) {
    map: MapMode,
    background: BackgroundMode,
    polygon_fill: PolygonFillMode,
    binary_raster_operation: BinaryRasterOperation,
    stretch: Stretch,
    arc_direction: ArcDirection,
};

pub fn parse(record: records.Record) !?Value {
    const kind = record.kind;
    switch (kind) {
        .setmapmode,
        .setbkmode,
        .setpolyfillmode,
        .setrop2,
        .setstretchbltmode,
        .setarcdirection,
        => {},
        else => return null,
    }
    if (record.size != 12 or record.bytes.len != 12) return error.InvalidEmfModeRecordSize;
    const raw = std.mem.readInt(u32, record.bytes[8..12], .little);
    return switch (kind) {
        .setmapmode => .{ .map = std.enums.fromInt(MapMode, raw) orelse return error.InvalidEmfMapMode },
        .setbkmode => .{ .background = std.enums.fromInt(BackgroundMode, raw) orelse return error.InvalidEmfBackgroundMode },
        .setpolyfillmode => .{ .polygon_fill = std.enums.fromInt(PolygonFillMode, raw) orelse return error.InvalidEmfPolygonFillMode },
        .setrop2 => .{ .binary_raster_operation = std.enums.fromInt(BinaryRasterOperation, raw) orelse return error.InvalidEmfBinaryRasterOperation },
        .setstretchbltmode => .{ .stretch = .{ .raw = raw, .known = std.enums.fromInt(StretchMode, raw) } },
        .setarcdirection => .{ .arc_direction = std.enums.fromInt(ArcDirection, raw) orelse return error.InvalidEmfArcDirection },
        else => unreachable,
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

fn modeBytes(raw: u32) [12]u8 {
    var bytes = [_]u8{0} ** 12;
    std.mem.writeInt(u32, bytes[8..12], raw, .little);
    return bytes;
}

test "mode records parse every defined enumeration value" {
    for (1..9) |raw| {
        const bytes = modeBytes(@intCast(raw));
        try std.testing.expectEqual(@as(u32, @intCast(raw)), @intFromEnum((try parse(fixture(.setmapmode, &bytes))).?.map));
    }
    for (1..3) |raw| {
        const bytes = modeBytes(@intCast(raw));
        try std.testing.expectEqual(@as(u32, @intCast(raw)), @intFromEnum((try parse(fixture(.setbkmode, &bytes))).?.background));
        try std.testing.expectEqual(@as(u32, @intCast(raw)), @intFromEnum((try parse(fixture(.setpolyfillmode, &bytes))).?.polygon_fill));
        try std.testing.expectEqual(@as(u32, @intCast(raw)), @intFromEnum((try parse(fixture(.setarcdirection, &bytes))).?.arc_direction));
    }
    for (1..17) |raw| {
        const bytes = modeBytes(@intCast(raw));
        try std.testing.expectEqual(@as(u32, @intCast(raw)), @intFromEnum((try parse(fixture(.setrop2, &bytes))).?.binary_raster_operation));
    }
    for (1..5) |raw| {
        const bytes = modeBytes(@intCast(raw));
        const value = (try parse(fixture(.setstretchbltmode, &bytes))).?.stretch;
        try std.testing.expectEqual(@as(u32, @intCast(raw)), value.raw);
        try std.testing.expectEqual(@as(u32, @intCast(raw)), @intFromEnum(value.known.?));
    }
}

test "stretch mode preserves values outside the optional enumeration" {
    for ([_]u32{ 0, 5, std.math.maxInt(u32) }) |raw| {
        const bytes = modeBytes(raw);
        const value = (try parse(fixture(.setstretchbltmode, &bytes))).?.stretch;
        try std.testing.expectEqual(raw, value.raw);
        try std.testing.expect(value.known == null);
    }
}

test "strict mode records reject values outside their enumerations" {
    var bytes = modeBytes(0);
    try std.testing.expectError(error.InvalidEmfMapMode, parse(fixture(.setmapmode, &bytes)));
    try std.testing.expectError(error.InvalidEmfBackgroundMode, parse(fixture(.setbkmode, &bytes)));
    try std.testing.expectError(error.InvalidEmfPolygonFillMode, parse(fixture(.setpolyfillmode, &bytes)));
    try std.testing.expectError(error.InvalidEmfBinaryRasterOperation, parse(fixture(.setrop2, &bytes)));
    try std.testing.expectError(error.InvalidEmfArcDirection, parse(fixture(.setarcdirection, &bytes)));
    bytes = modeBytes(std.math.maxInt(u32));
    try std.testing.expectError(error.InvalidEmfMapMode, parse(fixture(.setmapmode, &bytes)));
    try std.testing.expectError(error.InvalidEmfBinaryRasterOperation, parse(fixture(.setrop2, &bytes)));
}

test "mode records require exact size and do not claim unrelated records" {
    var short = [_]u8{0} ** 8;
    try std.testing.expectError(error.InvalidEmfModeRecordSize, parse(fixture(.setmapmode, &short)));
    var declared_twelve = fixture(.setmapmode, &short);
    declared_twelve.size = 12;
    try std.testing.expectError(error.InvalidEmfModeRecordSize, parse(declared_twelve));
    var long = [_]u8{0} ** 16;
    long[8] = 1;
    try std.testing.expectError(error.InvalidEmfModeRecordSize, parse(fixture(.setstretchbltmode, &long)));
    var declared_twelve_long = fixture(.setstretchbltmode, &long);
    declared_twelve_long.size = 12;
    try std.testing.expectError(error.InvalidEmfModeRecordSize, parse(declared_twelve_long));
    try std.testing.expect((try parse(fixture(.savedc, &short))) == null);
}
