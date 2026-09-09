const std = @import("std");
const t = std.testing;
const jpeg = @import("jfif_progressive_rgb.zig");
const sequential = @import("jfif_rgb.zig");

const jfif = [_]u8{ 255, 224, 0, 16 } ++ "JFIF\x00".* ++ .{ 1, 2, 0, 0, 1, 0, 1, 0, 0 };
const q = [_]u8{ 255, 219, 0, 67, 0 } ++ [_]u8{8} ** 64;
const h = [_]u8{ 255, 196, 0, 38, 0, 1 } ++ [_]u8{0} ** 15 ++ .{ 1, 16, 1 } ++ [_]u8{0} ** 15 ++ .{0};
const sof = [_]u8{ 255, 194, 0, 11, 8, 0, 1, 0, 1, 1, 1, 17, 0 };
const dc = [_]u8{ 255, 218, 0, 8, 1, 1, 0, 0, 0, 1, 0x7f };
const ac = [_]u8{ 255, 218, 0, 8, 1, 1, 0, 1, 63, 0, 0x7f };
const refine = [_]u8{ 255, 218, 0, 8, 1, 1, 0, 0, 0, 16, 255, 0 };
const adobe = [_]u8{ 255, 238, 0, 14 } ++ "Adobe".* ++ .{ 0, 100, 0, 0, 0, 0, 0 };
const profile = [_]u8{ 255, 226, 0, 19 } ++ "ICC_PROFILE\x00".* ++ .{ 1, 1, 9, 2, 7 };
const prefix = [_]u8{ 255, 216 } ++ jfif ++ q ++ h ++ sof ++ dc ++ ac;
const raw = prefix ++ refine ++ adobe ++ profile ++ .{ 255, 217 };
const partial = prefix ++ adobe ++ profile ++ .{ 255, 217 };
const options: jpeg.Options = .{ .samples = .{ .frame = .{ .completion = .require_full } }, .render = .{ .upsampling = .nearest, .colour_management = .unmanaged } };

fn successful(a: std.mem.Allocator) !void {
    var bytes = raw;
    var result = try jpeg.decode(a, &bytes, options);
    defer result.deinit(a);
    @memset(&bytes, 0);
    try t.expectEqualSlices(u8, &.{ 131, 131, 131 }, result.image.raster.rgb);
    try t.expectEqual(@as(u8, 1), result.components);
    try t.expectEqual(@as(usize, 3), result.progression.scans);
    try t.expectEqual(@as(usize, 64), result.progression.full_coefficients);
    for (result.levels[0]) |level| try t.expectEqual(@as(u8, 0), level);
    try t.expect(result.image.metadata_deferred);
    try t.expectEqual(@as(u16, 0x0102), result.image.jfif_version);
    try t.expectEqual(@as(usize, 1), result.image.adobe_headers);
    try t.expectEqual(@as(u8, 1), result.image.icc_chunks);
    try t.expectEqual(@as(usize, 2), result.image.application_markers);
}

fn colourSuccessful(a: std.mem.Allocator, bytes: []const u8, method: @import("upsampling.zig").Method) !void {
    var chosen = options;
    chosen.render.upsampling = method;
    var result = try jpeg.decode(a, bytes, chosen);
    defer result.deinit(a);
    try t.expectEqualSlices(u8, &.{ 130, 125, 132 }, result.image.raster.rgb);
    try t.expectEqual(@as(u8, 3), result.components);
    try t.expectEqual(@as(usize, 192), result.progression.full_coefficients);
}

test "JPEG progressive RGB owns pixels metadata and precision history across allocation failures" {
    try successful(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, successful, .{});
}

test "JPEG progressive RGB preserves explicit partial policy without claiming colour management" {
    var chosen = options;
    chosen.samples.frame.completion = .preserve_partial;
    var result = try jpeg.decode(t.allocator, &partial, chosen);
    defer result.deinit(t.allocator);
    try t.expectEqualSlices(u8, &.{ 130, 130, 130 }, result.image.raster.rgb);
    try t.expectEqual(@as(usize, 1), result.progression.partial_coefficients);
    try t.expectEqual(@as(usize, 63), result.progression.full_coefficients);
    try t.expectEqual(@as(u8, 1), result.levels[0][0]);
    try t.expect(result.image.metadata_deferred);
    try t.expectError(error.IncompleteJpegProgressiveCoefficients, jpeg.decode(t.allocator, &partial, options));
    const dc_only = [_]u8{ 255, 216 } ++ jfif ++ q ++ h ++ sof ++ dc ++ .{ 255, 217 };
    var unseen_ac = try jpeg.decode(t.allocator, &dc_only, chosen);
    defer unseen_ac.deinit(t.allocator);
    try t.expectEqualSlices(u8, &.{ 130, 130, 130 }, unseen_ac.image.raster.rgb);
    try t.expectEqual(@as(usize, 63), unseen_ac.progression.unseen_coefficients);
    try t.expectEqual(@as(usize, 0), unseen_ac.progression.full_coefficients);
    try t.expectEqual(@as(u8, 255), unseen_ac.levels[0][63]);
}

test "JPEG progressive RGB keeps independent output sample coefficient work and metadata budgets" {
    for (0..7) |which| {
        var bounded = options;
        switch (which) {
            0 => bounded.render.max_rgb_bytes = 2,
            1 => bounded.samples.max_samples = 0,
            2 => bounded.samples.frame.storage.max_bytes = 255,
            3 => bounded.samples.frame.max_block_visits = 1,
            4 => bounded.render.max_icc_bytes = 2,
            5 => bounded.render.max_adobe_markers = 0,
            6 => bounded.samples.frame.structure.max_scans = 2,
            else => unreachable,
        }
        try t.expectError(error.LimitExceeded, jpeg.decode(t.allocator, &raw, bounded));
    }
}

test "JPEG progressive RGB rejects its output budget before any allocation" {
    var failing = t.FailingAllocator.init(t.allocator, .{ .fail_index = 0 });
    var bounded = options;
    bounded.render.max_rgb_bytes = 2;
    try t.expectError(error.LimitExceeded, jpeg.decode(failing.allocator(), &raw, bounded));
}

test "JPEG progressive RGB rejects late conflicts padding truncation and forbidden trailing bytes" {
    const conflict = prefix ++ refine ++ adobe ++ adobe[0 .. adobe.len - 1].* ++ .{ 1, 255, 217 };
    try t.expectError(error.ConflictingJfifAdobeColour, jpeg.decode(t.allocator, &conflict, options));
    const earlier_conflict = prefix ++ refine ++ adobe[0 .. adobe.len - 1].* ++ .{1} ++ adobe ++ .{ 255, 217 };
    try t.expectError(error.ConflictingJfifAdobeColour, jpeg.decode(t.allocator, &earlier_conflict, options));
    const corrupt = prefix ++ refine[0 .. refine.len - 2].* ++ .{ 0xfe, 255, 217 };
    try t.expectError(error.InvalidJpegEntropyPadding, jpeg.decode(t.allocator, &corrupt, options));
    for (0..raw.len) |n| {
        if (jpeg.decode(t.allocator, raw[0..n], options)) |value| {
            var unexpected = value;
            unexpected.deinit(t.allocator);
            return error.UnexpectedValidTruncation;
        } else |_| {}
    }
    const tail = raw ++ .{7};
    try t.expectError(error.TrailingJpegBytes, jpeg.decode(t.allocator, &tail, options));
    var allowed = options;
    allowed.samples.frame.structure.allow_trailing_bytes = true;
    var result = try jpeg.decode(t.allocator, &tail, allowed);
    defer result.deinit(t.allocator);
    try t.expectEqualSlices(u8, &.{ 131, 131, 131 }, result.image.raster.rgb);
}

test "JPEG progressive RGB keeps the existing sequential entry point explicit" {
    try t.expectError(error.UnsupportedJpegSequentialProcess, sequential.decode(t.allocator, &raw, .{ .upsampling = .nearest, .colour_management = .unmanaged }));
    const baseline_sof = [_]u8{ 255, 192 } ++ sof[2..].*;
    const baseline_scan = [_]u8{ 255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 0x5f };
    const baseline = [_]u8{ 255, 216 } ++ jfif ++ q ++ h ++ baseline_sof ++ baseline_scan ++ .{ 255, 217 };
    try t.expectError(error.UnsupportedJpegProgressionProcess, jpeg.decode(t.allocator, &baseline, options));
}

test "JPEG progressive RGB uses frame colour order despite reordered differently sampled scans" {
    const frame = [_]u8{ 255, 194, 0, 17, 8, 0, 1, 0, 1, 3, 1, 49, 0, 2, 18, 0, 3, 17, 0 };
    const first = [_]u8{ 255, 216 } ++ jfif ++ q ++ h ++ frame ++
        .{ 255, 218, 0, 8, 1, 3, 0, 0, 0, 1, 0x7f } ++
        .{ 255, 218, 0, 8, 1, 1, 0, 0, 0, 1, 0x3f } ++
        .{ 255, 218, 0, 8, 1, 2, 0, 0, 0, 1, 0x7f } ++
        .{ 255, 218, 0, 8, 1, 2, 0, 1, 63, 0, 0x7f } ++
        .{ 255, 218, 0, 8, 1, 1, 0, 1, 63, 0, 0x7f } ++
        .{ 255, 218, 0, 8, 1, 3, 0, 1, 63, 0, 0x7f };
    const full = first ++
        .{ 255, 218, 0, 8, 1, 1, 0, 0, 0, 16, 255, 0 } ++
        .{ 255, 218, 0, 8, 1, 3, 0, 0, 0, 16, 0x7f } ++
        .{ 255, 218, 0, 8, 1, 2, 0, 0, 0, 16, 255, 0, 255, 217 };
    for ([_]@import("upsampling.zig").Method{ .nearest, .bilinear }) |method| {
        try colourSuccessful(t.allocator, &full, method);
        try t.checkAllAllocationFailures(t.allocator, colourSuccessful, .{ @as([]const u8, &full), method });
    }
    const unseen = [_]u8{ 255, 216 } ++ jfif ++ q ++ h ++ frame ++ dc ++ .{ 255, 217 };
    var preserve = options;
    preserve.samples.frame.completion = .preserve_partial;
    try t.expectError(error.UnseenJpegProgressiveComponent, jpeg.decode(t.allocator, &unseen, preserve));
}
