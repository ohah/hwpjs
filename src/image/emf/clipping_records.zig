const geometry = @import("geometry.zig");
const record_extent = @import("record_extent.zig");
const records = @import("records.zig");

pub const Value = union(enum) {
    offset: geometry.PointL,
    set_meta_region: void,
    exclude_rectangle: geometry.RectL,
    intersect_rectangle: geometry.RectL,
};

pub fn parse(record: records.Record) !?Value {
    return switch (record.kind) {
        .offsetcliprgn => {
            if (!record_extent.hasRequiredPrefix(record, 16)) return error.InvalidEmfOffsetClipRegionSize;
            return .{ .offset = try geometry.parsePointL(record.bytes[8..16]) };
        },
        .setmetargn => {
            if (!record_extent.hasRequiredPrefix(record, 8)) return error.InvalidEmfSetMetaRegionSize;
            return .{ .set_meta_region = {} };
        },
        .excludecliprect => return .{ .exclude_rectangle = try parseRectangle(record) },
        .intersectcliprect => return .{ .intersect_rectangle = try parseRectangle(record) },
        else => null,
    };
}

fn parseRectangle(record: records.Record) !geometry.RectL {
    if (!record_extent.hasRequiredPrefix(record, 24)) return error.InvalidEmfClipRectangleSize;
    return geometry.parseRectL(record.bytes[8..24]);
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "fixed clipping records preserve signed geometry and distinct operations" {
    const std = @import("std");
    var bytes = [_]u8{0} ** 24;
    for ([_]i32{ std.math.minInt(i32), -2, 3, std.math.maxInt(i32) }, 0..) |value, index|
        std.mem.writeInt(i32, bytes[8 + index * 4 ..][0..4], value, .little);

    const offset_value = (try parse(fixture(.offsetcliprgn, bytes[0..16]))).?;
    try std.testing.expectEqual(.offset, std.meta.activeTag(offset_value));
    const offset = offset_value.offset;
    try std.testing.expectEqual(std.math.minInt(i32), offset.x);
    try std.testing.expectEqual(@as(i32, -2), offset.y);
    try std.testing.expectEqual(.set_meta_region, std.meta.activeTag((try parse(fixture(.setmetargn, bytes[0..8]))).?));

    const excluded_value = (try parse(fixture(.excludecliprect, &bytes))).?;
    try std.testing.expectEqual(.exclude_rectangle, std.meta.activeTag(excluded_value));
    const excluded = excluded_value.exclude_rectangle;
    try std.testing.expectEqual(std.math.minInt(i32), excluded.left);
    try std.testing.expectEqual(std.math.maxInt(i32), excluded.bottom);
    const intersected_value = (try parse(fixture(.intersectcliprect, &bytes))).?;
    try std.testing.expectEqual(.intersect_rectangle, std.meta.activeTag(intersected_value));
    const intersected = intersected_value.intersect_rectangle;
    try std.testing.expectEqual(@as(i32, 3), intersected.right);
    try std.testing.expectEqual(@as(i32, -2), intersected.top);
}

test "fixed clipping records require complete prefixes and accept trailing data" {
    const std = @import("std");
    const bytes = [_]u8{0} ** 28;
    inline for (.{
        .{ records.RecordType.offsetcliprgn, @as(usize, 16), error.InvalidEmfOffsetClipRegionSize },
        .{ records.RecordType.setmetargn, @as(usize, 8), error.InvalidEmfSetMetaRegionSize },
        .{ records.RecordType.excludecliprect, @as(usize, 24), error.InvalidEmfClipRectangleSize },
        .{ records.RecordType.intersectcliprect, @as(usize, 24), error.InvalidEmfClipRectangleSize },
    }) |case| {
        for (0..case[1]) |length|
            try std.testing.expectError(case[2], parse(fixture(case[0], bytes[0..length])));
        try std.testing.expect((try parse(fixture(case[0], bytes[0 .. case[1] + 4]))) != null);
        var mismatched = fixture(case[0], bytes[0..case[1]]);
        mismatched.size += 4;
        try std.testing.expectError(case[2], parse(mismatched));
    }
    try std.testing.expect((try parse(fixture(.selectclippath, bytes[0..12]))) == null);
}
