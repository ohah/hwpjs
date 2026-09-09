const std = @import("std");
const t = std.testing;
const decoder = @import("progressive_frame.zig");
const Frame = @import("frame.zig");
const storage = @import("coefficient_storage.zig");
const mono = [_]u8{ 8, 0, 1, 0, 1, 1, 9, 17, 0 };
const pair = [_]u8{ 8, 0, 1, 0, 1, 2, 9, 17, 0, 4, 17, 0 };
const q = [_]u8{0} ++ [_]u8{1} ** 64;
const dc = [_]u8{ 0, 1 } ++ [_]u8{0} ** 15 ++ .{1};
// 00 new coefficient; 01 EOB; 10 two/three-block EOB.
const ac = [_]u8{ 16, 0, 3 } ++ [_]u8{0} ** 14 ++ .{ 1, 0, 16 };

fn marker(out: *std.ArrayList(u8), code: u8, payload: []const u8) !void {
    var prefix = [_]u8{ 255, code, 0, 0 };
    std.mem.writeInt(u16, prefix[2..4], @intCast(payload.len + 2), .big);
    try out.appendSlice(t.allocator, &prefix);
    try out.appendSlice(t.allocator, payload);
}
fn start(out: *std.ArrayList(u8), frame: []const u8) !void {
    try out.appendSlice(t.allocator, &.{ 255, 216 });
    try marker(out, 219, &q);
    try marker(out, 196, &dc);
    try marker(out, 194, frame);
    try marker(out, 196, &ac);
}
fn scan(out: *std.ArrayList(u8), payload: []const u8, raw: []const u8) !void {
    try marker(out, 218, payload);
    try out.appendSlice(t.allocator, raw);
}
fn finish(out: *std.ArrayList(u8)) !void {
    try out.appendSlice(t.allocator, &.{ 255, 217 });
}
fn fullMono(out: *std.ArrayList(u8)) !void {
    try start(out, &mono);
    try scan(out, &.{ 1, 9, 0, 0, 0, 2 }, &.{0x7f}); // +1 * 4
    try scan(out, &.{ 1, 9, 0, 1, 63, 2 }, &.{0x0f}); // -1 * 4, EOB
    try scan(out, &.{ 1, 9, 0, 0, 0, 0x21 }, &.{ 255, 0 }); // DC +2
    try scan(out, &.{ 1, 9, 0, 1, 63, 0x21 }, &.{0x7f}); // AC -2
    try scan(out, &.{ 1, 9, 0, 0, 0, 0x10 }, &.{0x7f}); // DC unchanged
    try scan(out, &.{ 1, 9, 0, 1, 63, 0x10 }, &.{0x7f}); // AC -1
    try finish(out);
}

test "JPEG progressive frame owns final coefficients metadata and quantization" {
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(t.allocator);
    try fullMono(&bytes);
    var image = try decoder.decode(t.allocator, bytes.items, .{ .completion = .require_full });
    defer image.deinit(t.allocator);
    @memset(bytes.items, 0); // No output metadata or Q view may borrow this input.
    try t.expectEqual(@as(usize, 6), image.block_visits);
    try t.expectEqual(@as(usize, 6), image.progression.scans);
    try t.expectEqual(@as(usize, 64), image.progression.full_coefficients);
    try t.expectEqual(@as(usize, 0), image.progression.unseen_coefficients);
    try t.expectEqual(@as(usize, 1), image.stored_blocks);
    const plane = &image.planes[0];
    try t.expectEqual(@as(u8, 9), plane.component.id);
    try t.expectEqual(@as(u32, 1), plane.visible.width);
    try t.expectEqual(@as(i32, 6), plane.grid.at(0, 0).?[0]);
    try t.expectEqual(@as(i32, -7), plane.grid.at(0, 0).?[1]);
    for (plane.grid.at(0, 0).?[2..]) |v| try t.expectEqual(@as(i32, 0), v);
    try t.expectEqual(@as(u16, 1), plane.quantization.?.view().value(63).?);
    try t.expect(plane.grid.at(std.math.maxInt(u32), 0) == null);
    try t.expect(plane.grid.at(0, std.math.maxInt(u32)) == null);
}

test "JPEG progressive frame partial policy preserves unseen distinct from zero and Al" {
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(t.allocator);
    try start(&bytes, &pair);
    try scan(&bytes, &.{ 1, 4, 0, 0, 0, 3 }, &.{0x3f}); // -8 in component index 1
    try finish(&bytes);
    var image = try decoder.decode(t.allocator, bytes.items, .{ .completion = .preserve_partial });
    defer image.deinit(t.allocator);
    try t.expectEqual(@as(usize, 127), image.progression.unseen_coefficients);
    try t.expectEqual(@as(usize, 1), image.progression.partial_coefficients);
    try t.expect(image.planes[0].quantization == null);
    try t.expect(image.planes[1].quantization != null);
    try t.expectEqual(@as(u8, 255), image.planes[0].levels[0]);
    try t.expectEqual(@as(u8, 3), image.planes[1].levels[0]);
    try t.expectEqual(@as(i32, 0), image.planes[0].grid.at(0, 0).?[0]);
    try t.expectEqual(@as(i32, -8), image.planes[1].grid.at(0, 0).?[0]);
    try t.expectError(error.IncompleteJpegProgressiveCoefficients, image.checkCompletion(.require_full));
    try t.expectError(error.IncompleteJpegProgressiveCoefficients, decoder.decode(t.allocator, bytes.items, .{ .completion = .require_full }));
}

test "JPEG progressive frame snapshots last used Q separately for shared destinations" {
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(t.allocator);
    try start(&bytes, &pair);
    for ([_]u8{ 9, 4 }, [_]u8{ 3, 5 }) |id, next_q| {
        try scan(&bytes, &.{ 1, id, 0, 0, 0, 0 }, &.{0x7f});
        try scan(&bytes, &.{ 1, id, 0, 1, 63, 0 }, &.{0x7f}); // EOB01
        var changed = q;
        @memset(changed[1..], next_q);
        try marker(&bytes, 219, &changed);
    }
    try finish(&bytes);
    var image = try decoder.decode(t.allocator, bytes.items, .{ .completion = .require_full });
    defer image.deinit(t.allocator);
    for (image.planes, [_]u16{ 1, 3 }) |*plane, expected| {
        try t.expectEqual(@as(i32, 1), plane.grid.at(0, 0).?[0]);
        for (0..64) |k| try t.expectEqual(expected, plane.quantization.?.view().value(k).?);
    }
}

test "JPEG progressive frame rejects changed then restored Q and duplicate zero initial bands" {
    for ([_]bool{ false, true }) |changed| {
        var bytes: std.ArrayList(u8) = .empty;
        defer bytes.deinit(t.allocator);
        try start(&bytes, &mono);
        try scan(&bytes, &.{ 1, 9, 0, 0, 0, 1 }, &.{0x7f});
        if (changed) {
            const other = [_]u8{0} ++ [_]u8{2} ** 64;
            try marker(&bytes, 219, &other);
            try marker(&bytes, 219, &q);
            try scan(&bytes, &.{ 1, 9, 0, 0, 0, 16 }, &.{0x7f});
        } else {
            try scan(&bytes, &.{ 1, 9, 0, 1, 63, 0 }, &.{0x7f});
            try scan(&bytes, &.{ 1, 9, 0, 1, 63, 0 }, &.{0x7f});
        }
        try finish(&bytes);
        try t.expectError(if (changed) error.AlteredJpegProgressiveQuantization else error.DuplicateJpegInitialBand, decoder.decode(t.allocator, bytes.items, .{ .completion = .preserve_partial }));
    }
}

test "JPEG progressive frame retains padded MCU coefficients across single AC scans" {
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(t.allocator);
    // Two MCU columns, 2 Y blocks + 1 C block each. Only three Y blocks visible.
    try start(&bytes, &.{ 8, 0, 8, 0, 17, 2, 9, 33, 0, 4, 17, 0 });
    try marker(&bytes, 221, &.{ 0, 1 });
    try scan(&bytes, &.{ 2, 9, 0, 4, 0, 0, 0, 0 }, &.{ 0x57, 255, 208, 0x57 }); // each MCU +1,+1,+1
    try marker(&bytes, 221, &.{ 0, 0 });
    try scan(&bytes, &.{ 1, 9, 0, 1, 63, 0 }, &.{0xbf}); // EOB3: 10,1,pad
    try scan(&bytes, &.{ 1, 4, 0, 1, 63, 0 }, &.{0x9f}); // EOB2: 10,0,pad
    try finish(&bytes);
    var image = try decoder.decode(t.allocator, bytes.items, .{ .completion = .require_full });
    defer image.deinit(t.allocator);
    try t.expectEqual(@as(usize, 6), image.stored_blocks);
    try t.expectEqual(@as(usize, 11), image.block_visits);
    try t.expectEqual(@as(usize, 1), image.restarts);
    for ([_]i32{ 1, 2, 1, 2 }, 0..) |value, x| try t.expectEqual(value, image.planes[0].grid.at(@intCast(x), 0).?[0]);
    try t.expectEqual(@as(u32, 17), image.planes[0].visible.width);
    try t.expectEqual(@as(u32, 4), image.planes[0].grid.extent.width);
}

test "JPEG progressive frame keeps nonsquare grid rows independent across scans" {
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(t.allocator);
    try start(&bytes, &.{ 8, 0, 9, 0, 17, 1, 9, 17, 0 });
    try scan(&bytes, &.{ 1, 9, 0, 0, 0, 0 }, &.{ 0x55, 0x5f }); // six +1 differences
    try scan(&bytes, &.{ 1, 9, 0, 1, 63, 0 }, &.{0xb7}); // two EOB3 runs
    try finish(&bytes);
    var image = try decoder.decode(t.allocator, bytes.items, .{ .completion = .require_full });
    defer image.deinit(t.allocator);
    try t.expectEqual(@as(usize, 12), image.block_visits);
    for (0..2) |y| for (0..3) |x| {
        try t.expectEqual(@as(i32, @intCast(y * 3 + x + 1)), image.planes[0].grid.at(@intCast(x), @intCast(y)).?[0]);
    };
}

test "JPEG progressive frame resolves DNL and keeps storage work and trailing policies separate" {
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(t.allocator);
    var frame = mono;
    frame[2] = 0;
    try start(&bytes, &frame);
    try scan(&bytes, &.{ 1, 9, 0, 0, 0, 0 }, &.{0x7f});
    try marker(&bytes, 220, &.{ 0, 1 });
    try scan(&bytes, &.{ 1, 9, 0, 1, 63, 0 }, &.{0x7f});
    try finish(&bytes);
    try bytes.append(t.allocator, 17);
    const options: decoder.Options = .{ .completion = .require_full, .structure = .{ .allow_trailing_bytes = true }, .storage = .{ .max_blocks = 1, .max_bytes = 256 }, .max_block_visits = 2 };
    var image = try decoder.decode(t.allocator, bytes.items, options);
    defer image.deinit(t.allocator);
    try t.expectEqual(@as(u16, 1), image.height);
    try t.expectEqual(@as(usize, 1), image.trailing_bytes);
    var limited = options;
    limited.max_block_visits = 1;
    try t.expectError(error.LimitExceeded, decoder.decode(t.allocator, bytes.items, limited));
    limited = options;
    limited.storage.max_bytes = 255;
    try t.expectError(error.LimitExceeded, decoder.decode(t.allocator, bytes.items, limited));
    limited = options;
    limited.storage.max_blocks = 0;
    try t.expectError(error.LimitExceeded, decoder.decode(t.allocator, bytes.items, limited));
    limited = options;
    limited.structure.allow_trailing_bytes = false;
    try t.expectError(error.TrailingJpegBytes, decoder.decode(t.allocator, bytes.items, limited));
}

fn allocateImage(a: std.mem.Allocator, bytes: []const u8) !void {
    var image = try decoder.decode(a, bytes, .{ .completion = .require_full });
    defer image.deinit(a);
}
fn lateFailure(a: std.mem.Allocator, bytes: []const u8) !void {
    _ = decoder.decode(a, bytes, .{ .completion = .require_full }) catch |err| {
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(error.InvalidJpegEntropyPadding, err);
        return;
    };
    return error.TestExpectedError;
}
test "JPEG progressive frame releases every allocation on success OOM and late entropy errors" {
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(t.allocator);
    try fullMono(&bytes);
    try t.checkAllAllocationFailures(t.allocator, allocateImage, .{bytes.items});
    bytes.items[bytes.items.len - 3] = 0x60; // valid EOB/correction, bad trailing padding
    try t.checkAllAllocationFailures(t.allocator, lateFailure, .{bytes.items});
    bytes.clearRetainingCapacity();
    try start(&bytes, &.{ 8, 0, 1, 0, 1, 4, 9, 17, 0, 4, 17, 0, 7, 17, 0, 2, 17, 0 });
    for ([_]u8{ 9, 4, 7, 2 }) |id| {
        try scan(&bytes, &.{ 1, id, 0, 0, 0, 0 }, &.{0x7f});
        try scan(&bytes, &.{ 1, id, 0, 1, 63, 0 }, &.{0x7f});
    }
    try finish(&bytes);
    try t.checkAllAllocationFailures(t.allocator, allocateImage, .{bytes.items});
    bytes.items[bytes.items.len - 3] = 0x40;
    try t.checkAllAllocationFailures(t.allocator, lateFailure, .{bytes.items});
}

test "JPEG coefficient storage preflights wide arithmetic before allocating" {
    const frame = try Frame.parse(194, &.{ 12, 255, 255, 255, 255, 4, 9, 68, 0, 4, 68, 0, 7, 68, 0, 2, 68, 0 }, .{ .max_pixels = std.math.maxInt(u64) });
    try t.expectError(error.LimitExceeded, storage.Layout.init(frame, 65535, .{ .max_blocks = std.math.maxInt(usize), .max_bytes = 256 * 1024 * 1024 }));
    const small = try Frame.parse(194, &pair, .{});
    try t.expectError(error.LimitExceeded, storage.Layout.init(small, 1, .{ .max_blocks = 1 }));
    const layout = try storage.Layout.init(small, 1, .{ .max_blocks = 2, .max_bytes = 512 });
    try t.expectEqual(@as(usize, 2), layout.blocks);
}

test "JPEG progressive frame preserves wide Q byte order and distinct entropy destinations" {
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(t.allocator);
    try start(&bytes, &.{ 12, 0, 1, 0, 1, 2, 9, 17, 3, 4, 17, 2 });
    const wide = [_]u8{0x13} ++ [_]u8{ 0x12, 0x34 } ** 64;
    const narrow = [_]u8{2} ++ [_]u8{5} ** 64;
    const h2 = [_]u8{ 2, 1 } ++ [_]u8{0} ** 15 ++ .{1};
    const h3 = [_]u8{ 3, 1 } ++ [_]u8{0} ** 15 ++ .{2};
    const h1 = [_]u8{ 17, 1 } ++ [_]u8{0} ** 15 ++ .{0};
    try marker(&bytes, 219, &wide);
    try marker(&bytes, 219, &narrow);
    try marker(&bytes, 196, &h2);
    try marker(&bytes, 196, &h3);
    try marker(&bytes, 196, &h1);
    try scan(&bytes, &.{ 1, 9, 32, 0, 0, 0 }, &.{0x7f});
    try scan(&bytes, &.{ 1, 9, 1, 1, 63, 0 }, &.{0x7f});
    try scan(&bytes, &.{ 1, 4, 48, 0, 0, 0 }, &.{0x5f});
    try scan(&bytes, &.{ 1, 4, 1, 1, 63, 0 }, &.{0x7f});
    try finish(&bytes);
    var image = try decoder.decode(t.allocator, bytes.items, .{ .completion = .require_full });
    defer image.deinit(t.allocator);
    @memset(bytes.items, 0);
    try t.expectEqual(@as(i32, 1), image.planes[0].grid.at(0, 0).?[0]);
    try t.expectEqual(@as(i32, 2), image.planes[1].grid.at(0, 0).?[0]);
    for (image.planes, [_]u16{ 0x1234, 5 }, [_]u8{ 3, 2 }, [_]u8{ 1, 0 }) |*plane, value, destination, precision| {
        const table = plane.quantization.?.view();
        try t.expectEqual(destination, table.destination);
        try t.expectEqual(precision, table.precision);
        for (0..64) |k| try t.expectEqual(value, table.value(k).?);
    }
}
