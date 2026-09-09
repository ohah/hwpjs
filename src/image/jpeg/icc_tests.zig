const std = @import("std");
const t = std.testing;
const chunks = @import("icc_chunks.zig");
const extraction = @import("icc_extraction.zig");
const profile = @import("icc_profile.zig");
const fixture = @import("../icc/tag_fixture.zig");

fn payload(a: std.mem.Allocator, sequence: u8, count: u8, bytes: []const u8) ![]u8 {
    const out = try a.alloc(u8, 14 + bytes.len);
    @memcpy(out[0..12], chunks.identifier);
    out[12] = sequence;
    out[13] = count;
    @memcpy(out[14..], bytes);
    return out;
}

const soi = [_]u8{ 255, 216 };
const rest = [_]u8{ 255, 192, 0, 11, 8, 0, 1, 0, 1, 1, 1, 17, 0, 255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 127, 255, 217 };
fn jpeg(a: std.mem.Allocator, data: []const u8, late: bool) ![]u8 {
    const out = try a.alloc(u8, 2 + rest.len + 4 + data.len);
    @memcpy(out[0..2], &soi);
    const at: usize = if (late) 2 + rest.len - 2 else 2;
    if (late) @memcpy(out[2..at], rest[0 .. rest.len - 2]);
    out[at..][0..2].* = .{ 255, 226 };
    std.mem.writeInt(u16, out[at + 2 ..][0..2], @intCast(data.len + 2), .big);
    @memcpy(out[at + 4 ..][0..data.len], data);
    @memcpy(out[at + 4 + data.len ..], if (late) rest[rest.len - 2 ..] else &rest);
    return out;
}

test "JPEG ICC chunk sequence byte matrix and all payload truncations" {
    var bytes = chunks.identifier.* ++ .{ 1, 1, 7 };
    for (0..256) |count| for (0..256) |sequence| {
        bytes[12] = @intCast(sequence);
        bytes[13] = @intCast(count);
        if (count == 0 or sequence == 0 or sequence > count) {
            try t.expectError(error.InvalidJpegIccSequence, chunks.Chunk.parse(&bytes));
        } else {
            const value = try chunks.Chunk.parse(&bytes);
            try t.expectEqual(sequence, value.sequence);
            try t.expectEqual(count, value.count);
            try t.expectEqualSlices(u8, &.{7}, value.bytes);
        }
    };
    bytes[12] = 1;
    bytes[13] = 1;
    for (0..14) |n| try t.expectError(error.UnexpectedEnd, chunks.Chunk.parse(bytes[0..n]));
    for (0..12) |i| {
        bytes[i] ^= 1;
        try t.expectError(error.InvalidJpegIccIdentifier, chunks.Chunk.parse(&bytes));
        bytes[i] ^= 1;
    }
    const huge = [_]u8{0} ** 65534;
    try t.expectError(error.LimitExceeded, chunks.Chunk.parse(&huge));
}

test "JPEG ICC collector orders 255 chunks and preserves failed add state" {
    var collector = chunks.Collector.init(255);
    var parts: [255][15]u8 = undefined;
    for (0..255) |i| {
        @memcpy(parts[i][0..12], chunks.identifier);
        parts[i][12] = @intCast(i + 1);
        parts[i][13] = 255;
        parts[i][14] = @intCast(i);
    }
    for (0..255) |i| {
        try collector.add(&parts[254 - i]);
        const previous = collector;
        try t.expectError(error.DuplicateJpegIccChunk, collector.add(&parts[254 - i]));
        try t.expectEqualDeep(previous, collector);
        if (i != 254) try t.expectError(error.MissingJpegIccChunk, collector.assemble(t.allocator));
    }
    const result = (try collector.assemble(t.allocator)).?;
    defer t.allocator.free(result);
    for (result, 0..) |byte, i| try t.expectEqual(i, byte);
    @memset(&parts[254], 0);
    try t.expectEqual(@as(u8, 254), result[254]);
    var limited = chunks.Collector.init(0);
    try t.expectError(error.LimitExceeded, limited.add(&parts[1]));
    try t.expect(limited.count == null and limited.received == 0 and limited.bytes == 0);
    var mixed = chunks.Collector.init(255);
    try mixed.add(&parts[1]);
    const before = mixed;
    parts[2][13] = 254;
    try t.expectError(error.InconsistentJpegIccCount, mixed.add(&parts[2]));
    try t.expectEqualDeep(before, mixed);
}

fn successful(a: std.mem.Allocator) !void {
    const icc = try fixture.make(a, 156, &.{.{ .signature = "text".*, .offset = 144, .size = 12 }});
    defer a.free(icc);
    const data = try payload(a, 1, 1, icc);
    defer a.free(data);
    const raw = try jpeg(a, data, true);
    defer a.free(raw);
    var result = (try profile.inspect(a, raw, .{ .layout = .icc_2022 })).?;
    defer result.deinit(a);
    @memset(raw, 0);
    try t.expectEqualSlices(u8, icc, result.bytes);
    try t.expectEqualSlices(u8, "data", result.tags.tags[0].data[0..4]);
    try t.expectEqual(@import("../icc/profile_id.zig").Status.not_calculated, result.id_status);
}

test "JPEG ICC maximal chunk and complete profile size limits" {
    const data = try t.allocator.alloc(u8, 65533);
    defer t.allocator.free(data);
    @memset(data, 42);
    @memcpy(data[0..12], chunks.identifier);
    data[13] = 255;
    var full = chunks.Collector.init(std.math.maxInt(usize));
    var short = chunks.Collector.init(chunks.max_profile_bytes - 1);
    for (1..256) |sequence| {
        data[12] = @intCast(sequence);
        try full.add(data);
        if (sequence < 255) try short.add(data) else try t.expectError(error.LimitExceeded, short.add(data));
    }
    try t.expectEqual(@as(usize, 16707345), full.bytes);
    try t.expectEqual(@as(u16, 254), short.received);
    try t.expectError(error.MissingJpegIccChunk, short.assemble(t.allocator));
    const assembled = (try full.assemble(t.allocator)).?;
    defer t.allocator.free(assembled);
    try t.expectEqual(full.bytes, assembled.len);
    try t.expect(std.mem.allEqual(u8, assembled, 42));
}

test "JPEG ICC profile owns reassembly and cleans up every allocation failure" {
    try successful(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, successful, .{});
}

test "JPEG ICC profile propagates ID and tag budget errors" {
    const icc = try fixture.make(t.allocator, 156, &.{.{ .signature = "text".*, .offset = 144, .size = 12 }});
    defer t.allocator.free(icc);
    icc[84..100].* = try @import("../icc/profile_id.zig").calculate(icc, icc.len);
    const data = try payload(t.allocator, 1, 1, icc);
    defer t.allocator.free(data);
    const raw = try jpeg(t.allocator, data, false);
    defer t.allocator.free(raw);
    var valid = (try profile.inspect(t.allocator, raw, .{ .layout = .icc_2022 })).?;
    defer valid.deinit(t.allocator);
    try t.expectEqual(@import("../icc/profile_id.zig").Status.verified, valid.id_status);
    try t.expectError(error.LimitExceeded, profile.inspect(t.allocator, raw, .{ .layout = .icc_2022, .max_tags = 0 }));
    // Alter tag type data without breaking its structural extent or padding.
    raw[2 + 4 + 14 + 144] ^= 1;
    try t.expectError(error.InvalidIccProfileId, profile.inspect(t.allocator, raw, .{ .layout = .icc_2022 }));
}

test "JPEG ICC extraction distinguishes absence empty payload and malformed profile" {
    const raw = soi ++ rest;
    var absent = try extraction.extract(t.allocator, &raw, .{});
    defer absent.deinit(t.allocator);
    try t.expect(absent.profile_bytes == null);
    try t.expect((try profile.inspect(t.allocator, &raw, .{ .layout = .bounded })) == null);
    const empty = chunks.identifier.* ++ .{ 1, 1 };
    for ([_]bool{ false, true }) |late| {
        const encoded = try jpeg(t.allocator, &empty, late);
        defer t.allocator.free(encoded);
        var result = try extraction.extract(t.allocator, encoded, .{ .max_profile_bytes = 0 });
        defer result.deinit(t.allocator);
        try t.expect(result.profile_bytes != null);
        try t.expectEqual(@as(usize, 0), result.profile_bytes.?.len);
        try t.expectError(error.InvalidIccProfileSize, profile.inspect(t.allocator, encoded, .{ .layout = .bounded }));
        for (0..encoded.len) |n| {
            if (extraction.extract(t.allocator, encoded[0..n], .{})) |value| {
                var unexpected = value;
                unexpected.deinit(t.allocator);
                return error.UnexpectedValidTruncation;
            } else |_| {}
        }
    }
    const wrong_id = chunks.identifier.* ++ .{ 1, 1, 9 };
    var other = wrong_id;
    other[0] = 'X';
    const encoded = try jpeg(t.allocator, &other, false);
    defer t.allocator.free(encoded);
    var ignored = try extraction.extract(t.allocator, encoded, .{});
    defer ignored.deinit(t.allocator);
    try t.expect(ignored.profile_bytes == null);
}
