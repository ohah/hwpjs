const std = @import("std");
const t = std.testing;
const images = @import("images.zig");
const gif = @import("gif_images.zig");
const f = @import("../../image/gif/fixtures.zig");

fn repeated(a: std.mem.Allocator) !void {
    const raw = try f.literals(a, 1, 1, false);
    defer a.free(raw);
    for (0..3) |which| {
        var b: images.Budget = .{ .options = .{ .gif = .{} } };
        switch (which) {
            0 => b.options.max_total_gif_index_bytes = 2,
            1 => b.options.max_total_gif_codes = 6,
            2 => b.options.max_total_gif_frames = 2,
            else => unreachable,
        }
        for (0..2) |_| try b.consume(a, raw, null);
        try t.expectEqualDeep(gif.Report{ .images = 2, .frames = 2, .index_bytes = 2, .codes = 6, .blocks = 4, .sub_blocks = 4, .rendering_deferred_images = 2 }, b.report.gif);
        const before = b.report;
        if (b.consume(a, raw, null)) |_| return error.UnexpectedGifSuccess else |err| {
            try t.expectEqualDeep(before, b.report);
            if (err != error.LimitExceeded) return err;
        }
        try t.expectEqualDeep(before, b.report);
        b.options.gif = null;
        try b.consume(a, raw, null);
        try t.expectEqualDeep(before.gif, b.report.gif);
        try t.expectEqual(@as(usize, 1), b.report.unhandled_binaries);
    }
}
test "HWP GIF independent accumulated budgets, disabled selection and allocation failures" {
    try repeated(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, repeated, .{});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try repeated(checked.allocator());
    try t.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}
test "HWP GIF local limits remain independent of aggregate caps" {
    const raw = try f.literals(t.allocator, 1, 1, false);
    defer t.allocator.free(raw);
    for (0..3) |which| {
        var b: images.Budget = .{ .options = .{ .gif = .{} } };
        switch (which) {
            0 => b.options.gif.?.max_total_pixels = 0,
            1 => b.options.gif.?.max_total_codes = 2,
            2 => b.options.gif.?.max_frames = 0,
            else => unreachable,
        }
        try t.expectError(error.LimitExceeded, b.consume(t.allocator, raw, null));
        try t.expectEqualDeep(images.Report{}, b.report);
    }
}
test "HWP GIF hints, unsupported versions and malformed input never fall back" {
    const raw = try f.literals(t.allocator, 1, 1, false);
    defer t.allocator.free(raw);
    var b: images.Budget = .{ .options = .{ .gif = .{} } };
    try b.consume(t.allocator, raw, "G\x00i\x00F\x00");
    try b.consume(t.allocator, raw, "x\x00");
    try t.expectEqual(@as(usize, 1), b.report.gif.extension_disagreements);
    const before = b.report;
    raw[4] = '8';
    try t.expectError(error.UnsupportedGifVersion, b.consume(t.allocator, raw, null));
    try t.expectEqualDeep(before, b.report);
    raw[4] = '9';
    for (0..raw.len) |cut| {
        if (b.consume(t.allocator, raw[0..cut], "g\x00i\x00f\x00")) |_| return error.UnexpectedGifSuccess else |_| {}
        try t.expectEqualDeep(before, b.report);
    }
}
test "HWP GIF overflow is checked for every scalar and does not commit" {
    inline for (std.meta.fields(gif.Report)) |field| {
        var left: gif.Report = .{};
        var right: gif.Report = .{};
        @field(left, field.name) = std.math.maxInt(usize);
        @field(right, field.name) = 1;
        try t.expectError(error.LimitExceeded, left.plus(right));
    }
    const raw = try f.literals(t.allocator, 1, 1, false);
    defer t.allocator.free(raw);
    var b: images.Budget = .{ .options = .{ .gif = .{} } };
    b.report.gif.images = std.math.maxInt(usize);
    const before = b.report;
    try t.expectError(error.LimitExceeded, b.consume(t.allocator, raw, null));
    try t.expectEqualDeep(before, b.report);
    inline for (.{ "index_bytes", "codes", "frames" }) |field| {
        b.report = .{};
        @field(b.report.gif, field) = std.math.maxInt(usize);
        const saved = b.report;
        try t.expectError(error.LimitExceeded, b.consume(t.allocator, raw, null));
        try t.expectEqualDeep(saved, b.report);
    }
}
fn detached(a: std.mem.Allocator) !void {
    var report = blk: {
        const raw = try f.literals(a, 1, 1, false);
        defer a.free(raw);
        const bytes = try @import("image_fixture.zig").withExtension(a, raw, 2, "gif");
        defer a.free(bytes);
        break :blk try @import("validation.zig").inspect(a, bytes, .{ .images = .{ .gif = .{} }, .document = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } } });
    };
    defer report.deinit(a);
    try t.expectEqual(@as(usize, 2), report.images.?.gif.images);
    try t.expectEqual(@as(usize, 2), report.images.?.gif.index_bytes);
    try t.expectEqual(@as(usize, 0), report.uninspected_streams);
}
test "HWP GIF report outlives CFB input with explicit heap accounting" {
    try detached(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, detached, .{});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try detached(checked.allocator());
    try t.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}
