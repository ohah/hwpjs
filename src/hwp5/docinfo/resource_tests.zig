const std = @import("std");
const d = @import("reader.zig");
const resources = @import("resources.zig");
const a = std.testing.allocator;

test "BinData variants flags UTF16 truncations and unknown bytes" {
    const embed = [_]u8{ 0x11, 0x83, 0x34, 0x12, 2, 0, 0, 0xd8, 0, 0 };
    for (0..embed.len) |n| try std.testing.expectError(error.UnexpectedEnd, d.BinData.parse(embed[0..n]));
    const b = try d.BinData.parse(&(embed ++ .{99}));
    try std.testing.expectEqual(@as(u16, 0x1234), b.data.embedding.id);
    try std.testing.expectEqualSlices(u8, embed[6..], b.data.embedding.extension_utf16);
    try std.testing.expectEqualSlices(u8, &.{99}, b.extra);
    try std.testing.expectEqual(@as(u2, 3), b.accessState());
    for (0..4) |mode| {
        const item = try d.BinData.parse(&.{ @as(u8, @intCast(mode)) * 16 + 2, 0, 1, 0 });
        for ([_]bool{ false, true }) |default| {
            if (mode == 3) try std.testing.expectError(error.UnsupportedCompression, item.isCompressed(default)) else try std.testing.expectEqual(if (mode == 0) default else mode == 1, try item.isCompressed(default));
        }
    }
    const link = try d.BinData.parse(&.{ 0, 0, 1, 0, 'A', 0, 0, 0 });
    try std.testing.expectEqualSlices(u8, &.{ 'A', 0 }, link.data.link.absolute_utf16);
    try std.testing.expectEqual(@as(usize, 0), link.data.link.relative_utf16.len);
    const unknown = try d.BinData.parse(&.{ 15, 255, 9, 8, 7 });
    try std.testing.expectEqualSlices(u8, &.{ 9, 8, 7 }, unknown.data.unknown);
    var r = @import("../../binary/reader.zig").Reader{ .bytes = &.{ 99, 255, 255 }, .offset = 1 };
    try std.testing.expectError(error.UnexpectedEnd, @import("../utf16_string.zig").read(&r));
    try std.testing.expectEqual(@as(usize, 1), r.offset);
}

test "FaceName all optional flag combinations preserve empty versus absent" {
    for (0..8) |flags| {
        var bytes: [24]u8 = @splat(0);
        bytes[0] = @as(u8, @intCast(flags)) << 5;
        var length: usize = 3;
        if (flags & 4 != 0) {
            bytes[length] = 255;
            length += 3;
        }
        if (flags & 2 != 0) {
            for (0..10) |i| bytes[length + i] = @intCast(i + 1);
            length += 10;
        }
        if (flags & 1 != 0) length += 2;
        const f = try d.FaceName.parse(bytes[0..length]);
        try std.testing.expectEqual(flags & 4 != 0, f.substitute != null);
        try std.testing.expectEqual(flags & 2 != 0, f.type_info != null);
        try std.testing.expectEqual(flags & 1 != 0, f.default_utf16 != null);
        if (f.substitute) |s| try std.testing.expectEqual(@as(u8, 255), s.kind);
        if (f.type_info) |t| try std.testing.expectEqual(@as(u8, 10), t[9]);
        for (0..length) |n| try std.testing.expectError(error.UnexpectedEnd, d.FaceName.parse(bytes[0..n]));
        bytes[length] = 99;
        const extended = try d.FaceName.parse(bytes[0 .. length + 1]);
        try std.testing.expectEqualSlices(u8, &.{99}, extended.extra);
    }
}

test "resource counts missing duplicate negative mismatch and font ID bounds" {
    const v = @import("../version.zig").Version{ .raw = 0x05010001 };
    var data = [_]u8{0} ** 71;
    // ID_MAPPINGS(size 60), then one empty FACE_NAME(size 3, level 1).
    data[0..4].* = .{ 17, 0, 0xc0, 3 };
    data[8] = 1; // Korean font count
    data[64..68].* = .{ 19, 4, 0x30, 0 };
    const result = try resources.inspect(&data, v, .{});
    try result.validate();
    try std.testing.expectEqual(@as(?usize, 0), try result.fontOrdinal(.korean, 0));
    try std.testing.expectEqual(@as(?usize, null), try result.fontOrdinal(.korean, 1));
    try std.testing.expectEqual(@as(?usize, null), try result.fontOrdinal(.english, 0));
    data[8] = 2;
    try std.testing.expectError(error.ResourceCountMismatch, (try resources.inspect(&data, v, .{})).validate());
    @memset(data[8..12], 255);
    try std.testing.expectError(error.NegativeMappingCount, (try resources.inspect(&data, v, .{})).validate());
    try std.testing.expectError(error.MissingIdMappings, resources.inspect(&.{}, v, .{}));
    const duplicate = data[0..64].* ++ data[0..64].*;
    try std.testing.expectError(error.DuplicateIdMappings, resources.inspect(&duplicate, v, .{}));
}

fn decodeExercise(allocator: std.mem.Allocator) !void {
    var header = @import("../file_header.zig").Header{ .raw = @splat(0) };
    header.raw[35] = 5;
    const decode = @import("../bin_data_stream.zig").decode;
    const bytes = [_]u8{ 1, 3, 0, 252, 255, 'a', 'b', 'c' };
    const compressed = try d.BinData.parse(&.{ 0x12, 0, 1, 0 });
    const out = try decode(allocator, &header, compressed, &bytes, 3);
    defer allocator.free(out);
    try std.testing.expectEqualStrings("abc", out);
    const plain = try d.BinData.parse(&.{ 0x22, 0, 1, 0 });
    header.raw[36] = 1;
    const copy = try decode(allocator, &header, plain, "abc", 3);
    defer allocator.free(copy);
    try std.testing.expectEqualStrings("abc", copy);
    try std.testing.expectError(error.LimitExceeded, decode(allocator, &header, plain, "abc", 2));
    try std.testing.expectError(error.InvalidDeflate, decode(allocator, &header, compressed, &.{7}, 3));
}
test "BinData stream per-item compression and allocation cleanup" {
    try std.testing.checkAllAllocationFailures(a, decodeExercise, .{});
    var header = @import("../file_header.zig").Header{ .raw = @splat(0) };
    header.raw[35] = 5;
    const decode = @import("../bin_data_stream.zig").decode;
    const link = try d.BinData.parse(&.{ 0, 0, 0, 0, 0, 0 });
    const unknown = try d.BinData.parse(&.{ 15, 0 });
    try std.testing.expectError(error.ExternalLink, decode(a, &header, link, &.{}, 0));
    try std.testing.expectError(error.UnsupportedBinDataType, decode(a, &header, unknown, &.{}, 0));
}

test "all seven language font ID partitions and huge declared counts" {
    var bytes = [_]u8{0} ** 60;
    for (0..7) |i| std.mem.writeInt(i32, bytes[4 + i * 4 ..][0..4], @intCast(i + 1), .little);
    const report = resources.Report{
        .mappings = try d.IdMappings.parse(&bytes, .{ .raw = 0x05010001 }),
        .bin_data_count = 0,
        .face_name_count = 28,
    };
    var ordinal: usize = 0;
    for (0..7) |lang| {
        for (0..lang + 1) |id| {
            try std.testing.expectEqual(@as(?usize, ordinal), try report.fontOrdinal(@enumFromInt(lang), id));
            ordinal += 1;
        }
        try std.testing.expectEqual(@as(?usize, null), try report.fontOrdinal(@enumFromInt(lang), lang + 1));
    }
    for (0..7) |i| std.mem.writeInt(i32, bytes[4 + i * 4 ..][0..4], std.math.maxInt(i32), .little);
    try std.testing.expectError(error.ResourceCountMismatch, report.validate());
    try std.testing.expectError(error.ResourceCountMismatch, report.fontOrdinal(.user, 0));
}
