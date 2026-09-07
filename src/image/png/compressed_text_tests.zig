const std = @import("std");
const t = std.testing;
const compressed = @import("compressed_text.zig");
fn payload(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    const out = try a.alloc(u8, 14 + bytes.len);
    out[0..6].* = .{ 'K', 0, 0, 0x78, 1, 1 };
    const len: u16 = @intCast(bytes.len);
    std.mem.writeInt(u16, out[6..8], len, .little);
    std.mem.writeInt(u16, out[8..10], ~len, .little);
    @memcpy(out[10..][0..bytes.len], bytes);
    std.mem.writeInt(u32, out[10 + bytes.len ..][0..4], std.hash.Adler32.hash(bytes), .big);
    return out;
}
test "PNG compressed text methods truncation ownership and exact output limit" {
    const bytes = try payload(t.allocator, "Hello");
    defer t.allocator.free(bytes);
    for (0..256) |method| {
        bytes[2] = @intCast(method);
        if (method == 0) {
            var v = try compressed.decode(t.allocator, bytes, 5);
            defer v.deinit(t.allocator);
            try t.expectEqualStrings("Hello", v.text);
            try t.expectEqual(@intFromPtr(bytes.ptr), @intFromPtr(v.keyword.ptr));
        } else try t.expectError(error.UnsupportedPngTextCompressionMethod, compressed.decode(t.allocator, bytes, 5));
    }
    bytes[2] = 0;
    try t.expectError(error.LimitExceeded, compressed.decode(t.allocator, bytes, 4));
    for (0..bytes.len) |len| {
        if (compressed.decode(t.allocator, bytes[0..len], 5)) |value| {
            var owned = value;
            owned.deinit(t.allocator);
            return error.ExpectedFailure;
        } else |_| {}
    }
    var owned = try compressed.decode(t.allocator, bytes, 5);
    defer owned.deinit(t.allocator);
    @memset(bytes[10..15], 0);
    try t.expectEqualStrings("Hello", owned.text);
}
test "PNG compressed text empty body zero budget and invalid decoded characters" {
    const empty = try payload(t.allocator, "");
    defer t.allocator.free(empty);
    var v = try compressed.decode(t.allocator, empty, 0);
    defer v.deinit(t.allocator);
    try t.expectEqual(@as(usize, 0), v.text.len);
    for ([_]u8{ 0, 9, 13, 127, 159 }) |b| {
        const raw = try payload(t.allocator, &.{b});
        defer t.allocator.free(raw);
        try t.expectError(if (b == 0) error.InvalidPngTextNull else error.UnsupportedPngTextCharacter, compressed.decode(t.allocator, raw, 1));
    }
}
test "PNG compressed text mixed aggregate budget and atomic failure" {
    const State = @import("metadata.zig").State;
    const h: @import("header.zig").Header = .{ .width = 1, .height = 1, .color_type = 0, .bit_depth = 8, .interlace = 0 };
    const raw = try payload(t.allocator, "ABC");
    defer t.allocator.free(raw);
    const z: @import("chunks.zig").Chunk = .{ .name = "zTXt".*, .payload = raw, .raw = &.{} };
    const plain: @import("chunks.zig").Chunk = .{ .name = "tEXt".*, .payload = "K\x00AB", .raw = &.{} };
    for ([_]bool{ false, true }) |reverse| {
        var state: State = .{};
        try state.consumeBounded(t.allocator, h, 0, if (reverse) z else plain, 5);
        const saved = state;
        try t.expectError(error.LimitExceeded, state.consumeBounded(t.allocator, h, 0, if (reverse) plain else z, 4));
        try t.expectEqualDeep(saved, state);
        try state.consumeBounded(t.allocator, h, 0, if (reverse) plain else z, 5);
        try t.expectEqual(@as(usize, 2), state.text_bytes);
        try t.expectEqual(@as(usize, 3), state.compressed_text_bytes);
    }
    var near_max: State = .{ .text_bytes = std.math.maxInt(usize), .compressed_text_bytes = 1 };
    try t.expectError(error.LimitExceeded, near_max.consumeBounded(t.allocator, h, 0, z, std.math.maxInt(usize)));
}
fn exercise(a: std.mem.Allocator, good: []const u8, bad: []const u8) !void {
    const pixels = @import("pixels.zig");
    const report = try pixels.inspect(a, good, .{ .max_text_bytes = 3 });
    try t.expectEqual(@as(usize, 3), report.compressed_text_bytes);
    if (pixels.inspect(a, bad, .{})) |_| return error.ExpectedFailure else |err| switch (err) {
        error.OutOfMemory => return err,
        else => try t.expectEqual(error.InvalidPngTextNull, err),
    }
}
test "PNG compressed text integrated allocations and post inflate failure cleanup" {
    const fixture = @import("pixels_fixture.zig");
    const normal = try payload(t.allocator, "ABC");
    defer t.allocator.free(normal);
    const invalid = try payload(t.allocator, "A\x00B");
    defer t.allocator.free(invalid);
    const good = try fixture.withMetadata(t.allocator, 0, &.{.{ .name = "zTXt", .bytes = normal }});
    defer t.allocator.free(good);
    const bad = try fixture.withMetadata(t.allocator, 0, &.{.{ .name = "zTXt", .bytes = invalid }});
    defer t.allocator.free(bad);
    try t.checkAllAllocationFailures(t.allocator, exercise, .{ good, bad });
}
