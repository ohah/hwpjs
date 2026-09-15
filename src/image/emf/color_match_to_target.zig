const std = @import("std");
const records = @import("records.zig");
const values = @import("color_match_values.zig");
const utf16 = @import("../../text/utf16.zig");

pub const fixed_size = 24;

pub const ColorMatchToTarget = struct {
    action: values.Action,
    target: values.Target,
    name_utf16le: []const u8,
    profile_data: []const u8,
    name_stats: utf16.Stats,
};

pub fn parse(record: records.Record) !?ColorMatchToTarget {
    if (record.kind != .colormatchtotargetw) return null;
    if (record.size != record.bytes.len or record.bytes.len < fixed_size)
        return error.InvalidEmfColorMatchToTargetSize;

    const name_size = std.mem.readInt(u32, record.bytes[16..20], .little);
    const data_size = std.mem.readInt(u32, record.bytes[20..24], .little);
    const name_end_u64 = @as(u64, fixed_size) + name_size;
    const data_end_u64 = name_end_u64 + data_size;
    if (data_end_u64 != record.bytes.len) return error.InvalidEmfColorMatchToTargetSize;
    const name_end: usize = @intCast(name_end_u64);

    const name = record.bytes[fixed_size..name_end];
    const name_stats = utf16.inspect(name, .little) catch return error.InvalidEmfColorMatchTargetName;
    return .{
        .action = try values.action(std.mem.readInt(u32, record.bytes[8..12], .little)),
        .target = try values.target(std.mem.readInt(u32, record.bytes[12..16], .little)),
        .name_utf16le = name,
        .profile_data = record.bytes[name_end..],
        .name_stats = name_stats,
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

const test_fixed_size = 24;

test "COLORMATCHTOTARGETW parses empty and populated borrowed payloads" {
    var empty = [_]u8{0} ** test_fixed_size;
    std.mem.writeInt(u32, empty[8..12], 2, .little);
    const disabled = (try parse(fixture(.colormatchtotargetw, &empty))).?;
    try std.testing.expectEqual(values.Action.disable, disabled.action);
    try std.testing.expectEqual(values.Target.not_embedded, disabled.target);
    try std.testing.expectEqual(@as(usize, 0), disabled.name_utf16le.len);
    try std.testing.expectEqual(@as(usize, 0), disabled.profile_data.len);

    var bytes = [_]u8{0} ** 36;
    std.mem.writeInt(u32, bytes[8..12], 1, .little);
    std.mem.writeInt(u32, bytes[12..16], 1, .little);
    std.mem.writeInt(u32, bytes[16..20], 8, .little);
    std.mem.writeInt(u32, bytes[20..24], 4, .little);
    bytes[24..32].* = .{ 'A', 0, 0x3d, 0xd8, 0x00, 0xde, 0, 0 };
    bytes[32..36].* = .{ 1, 2, 3, 4 };
    const value = (try parse(fixture(.colormatchtotargetw, &bytes))).?;
    try std.testing.expectEqual(values.Action.enable, value.action);
    try std.testing.expectEqual(values.Target.embedded, value.target);
    try std.testing.expectEqualSlices(u8, bytes[24..32], value.name_utf16le);
    try std.testing.expectEqualSlices(u8, &.{ 1, 2, 3, 4 }, value.profile_data);
    try std.testing.expectEqual(@as(usize, 3), value.name_stats.scalars);
    try std.testing.expect(value.name_stats.ends_in_nul);
}

test "COLORMATCHTOTARGETW validates exact extents values UTF16 and identity" {
    var bytes = [_]u8{0} ** 32;
    std.mem.writeInt(u32, bytes[8..12], 3, .little);
    std.mem.writeInt(u32, bytes[16..20], 4, .little);
    std.mem.writeInt(u32, bytes[20..24], 4, .little);
    bytes[24..28].* = .{ 'X', 0, 0, 0 };
    for (0..bytes.len) |cut|
        try std.testing.expectError(error.InvalidEmfColorMatchToTargetSize, parse(fixture(.colormatchtotargetw, bytes[0..cut])));

    var declared = fixture(.colormatchtotargetw, &bytes);
    declared.size -= 4;
    try std.testing.expectError(error.InvalidEmfColorMatchToTargetSize, parse(declared));
    var short_name = bytes;
    std.mem.writeInt(u32, short_name[16..20], 2, .little);
    try std.testing.expectError(error.InvalidEmfColorMatchToTargetSize, parse(fixture(.colormatchtotargetw, &short_name)));
    var huge = bytes;
    std.mem.writeInt(u32, huge[16..20], std.math.maxInt(u32), .little);
    std.mem.writeInt(u32, huge[20..24], std.math.maxInt(u32), .little);
    try std.testing.expectError(error.InvalidEmfColorMatchToTargetSize, parse(fixture(.colormatchtotargetw, &huge)));
    var bad_action = bytes;
    std.mem.writeInt(u32, bad_action[8..12], 4, .little);
    try std.testing.expectError(error.InvalidEmfColorSpaceAction, parse(fixture(.colormatchtotargetw, &bad_action)));
    var bad_target = bytes;
    std.mem.writeInt(u32, bad_target[12..16], 2, .little);
    try std.testing.expectError(error.InvalidEmfColorMatchTarget, parse(fixture(.colormatchtotargetw, &bad_target)));
    var odd_name = bytes;
    std.mem.writeInt(u32, odd_name[16..20], 3, .little);
    std.mem.writeInt(u32, odd_name[20..24], 5, .little);
    try std.testing.expectError(error.InvalidEmfColorMatchTargetName, parse(fixture(.colormatchtotargetw, &odd_name)));
    var lone_surrogate = bytes;
    lone_surrogate[24..28].* = .{ 0x00, 0xd8, 0, 0 };
    try std.testing.expectError(error.InvalidEmfColorMatchTargetName, parse(fixture(.colormatchtotargetw, &lone_surrogate)));
    try std.testing.expect((try parse(fixture(.savedc, bytes[0..8]))) == null);
}
