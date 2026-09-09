const std = @import("std");
const t = std.testing;
const images = @import("images.zig");
const jpeg = @import("jpeg_images.zig");
const fixture = @import("jpeg_image_fixture.zig");
const container = @import("validation.zig");
const options: jpeg.Options = .{ .completion = .require_full, .render = .{ .upsampling = .nearest, .colour_management = .unmanaged } };
const jpg = &[_]u8{ 'j', 0, 'p', 0, 'g', 0 };

fn consume(a: std.mem.Allocator, raw: []const u8) !void {
    var budget: images.Budget = .{ .options = .{ .jpeg = options, .max_total_pixel_bytes = 0, .max_total_jpeg_rgb_bytes = 6 } };
    try budget.consume(a, raw, jpg);
    try budget.consume(a, raw, null);
    try t.expectEqual(@as(usize, 2), budget.report.binaries);
    try t.expectEqual(@as(usize, 2), budget.report.jpeg.images);
    try t.expectEqual(@as(usize, 6), budget.report.jpeg.rgb_bytes);
    try t.expectEqual(@as(usize, 2), budget.report.jpeg.metadata_deferred_images);
    try t.expectEqual(@as(usize, 0), budget.report.pixel_bytes);
    try t.expectEqual(@as(usize, 0), budget.report.unhandled_binaries);
    const before = budget.report;
    try t.expectError(error.LimitExceeded, budget.consume(a, raw, jpg));
    try t.expectEqualDeep(before, budget.report);
}
test "HWP JPEG repeated references keep a separate transactional RGB budget" {
    for ([_][]const u8{ &fixture.sequential, &fixture.progressive }) |raw| {
        try consume(t.allocator, raw);
        try t.checkAllAllocationFailures(t.allocator, consume, .{raw});
    }
}

test "HWP JPEG explicit selection retains PNG dispatch and unknown contents" {
    var budget: images.Budget = .{ .options = .{} };
    try budget.consume(t.allocator, "bad", jpg);
    try budget.consume(t.allocator, &fixture.sequential, jpg);
    try t.expectEqual(@as(usize, 2), budget.report.unhandled_binaries);
    budget.options.jpeg = options;
    const before = budget.report;
    try t.expectError(error.InvalidJpegMarker, budget.consume(t.allocator, "bad", jpg));
    try t.expectEqualDeep(before, budget.report);
    try budget.consume(t.allocator, &fixture.sequential, &.{ 'J', 0, 'P', 0, 'E', 0, 'G', 0 });
    try budget.consume(t.allocator, &fixture.progressive, &.{ 'b', 0, 'm', 0, 'p', 0 });
    try t.expectEqual(@as(usize, 1), budget.report.jpeg.extension_disagreements);
    const png = try @import("../../image/png/pixels_fixture.zig").image(t.allocator, 0);
    defer t.allocator.free(png);
    try budget.consume(t.allocator, png, jpg);
    try t.expectEqual(@as(usize, 1), budget.report.png_images);
    try t.expectEqual(@as(usize, 1), budget.report.png_extension_disagreements);
    try t.expectEqual(@as(usize, 2), budget.report.pixel_bytes);
    try t.expectEqual(@as(usize, 6), budget.report.jpeg.rgb_bytes);
}

test "HWP JPEG partial completion remains visible and strict rejection is atomic" {
    var budget: images.Budget = .{ .options = .{ .jpeg = options } };
    try t.expectError(error.IncompleteJpegProgressiveCoefficients, budget.consume(t.allocator, &fixture.partial, jpg));
    try t.expectEqualDeep(images.Report{}, budget.report);
    budget.options.jpeg.?.completion = .preserve_partial;
    try budget.consume(t.allocator, &fixture.partial, jpg);
    try t.expectEqual(@as(usize, 1), budget.report.jpeg.progressive_images);
    try t.expectEqual(@as(usize, 63), budget.report.jpeg.unseen_coefficients);
    try t.expectEqual(@as(usize, 1), budget.report.jpeg.full_coefficients);
    var refined_later = fixture.partial;
    refined_later[refined_later.len - 4] = 1; // Initial DC Al=1, still no AC.
    try budget.consume(t.allocator, &refined_later, jpg);
    try t.expectEqual(@as(usize, 1), budget.report.jpeg.partial_coefficients);
    try t.expectEqual(@as(usize, 126), budget.report.jpeg.unseen_coefficients);
    try t.expect(budget.report.semantics_deferred);
}

test "HWP JPEG malformed and unsupported inputs are never successful fallback" {
    for ([_][]const u8{ &fixture.sequential, &fixture.progressive }) |raw| {
        var budget: images.Budget = .{ .options = .{ .jpeg = options } };
        for (0..raw.len) |n| {
            if (budget.consume(t.allocator, raw[0..n], jpg)) |_| return error.UnexpectedValidTruncation else |_| {}
            try t.expectEqualDeep(images.Report{}, budget.report);
        }
        const broken = try t.allocator.dupe(u8, raw);
        defer t.allocator.free(broken);
        broken[broken.len - 3] &= 0xfe;
        try t.expectError(error.InvalidJpegEntropyPadding, budget.consume(t.allocator, broken, jpg));
        try t.expectEqualDeep(images.Report{}, budget.report);
    }
    var arithmetic = fixture.progressive;
    const at = std.mem.indexOf(u8, &arithmetic, &.{ 255, 194 }).?;
    arithmetic[at + 1] = 202;
    var budget: images.Budget = .{ .options = .{ .jpeg = options } };
    try t.expectError(error.UnsupportedHwpJpegProcess, budget.consume(t.allocator, &arithmetic, jpg));
    try t.expectEqualDeep(images.Report{}, budget.report);
    var failing = t.FailingAllocator.init(t.allocator, .{ .fail_index = 0 });
    budget.options.max_total_jpeg_rgb_bytes = 2;
    try t.expectError(error.LimitExceeded, budget.consume(failing.allocator(), &fixture.progressive, jpg));
}

test "HWP JPEG forwards metadata and trailing policies without losing deferrals" {
    const adobe = [_]u8{ 255, 238, 0, 14 } ++ "Adobe".* ++ .{ 0, 100, 0, 0, 0, 0, 0 };
    const icc = [_]u8{ 255, 226, 0, 19 } ++ "ICC_PROFILE\x00".* ++ .{ 1, 1, 9, 2, 7 };
    const raw = fixture.sequential[0 .. fixture.sequential.len - 2].* ++ adobe ++ icc ++ .{ 255, 217 };
    var budget: images.Budget = .{ .options = .{ .jpeg = options } };
    try budget.consume(t.allocator, &raw, jpg);
    try t.expectEqual(@as(usize, 1), budget.report.jpeg.profile_images);
    try t.expectEqual(@as(usize, 1), budget.report.jpeg.adobe_headers);
    const before = budget.report;
    budget.options.jpeg.?.render.max_adobe_markers = 0;
    try t.expectError(error.LimitExceeded, budget.consume(t.allocator, &raw, jpg));
    budget.options.jpeg = options;
    budget.options.jpeg.?.render.max_icc_bytes = 2;
    try t.expectError(error.LimitExceeded, budget.consume(t.allocator, &raw, jpg));
    budget.options.jpeg = options;
    const tail = raw ++ .{7};
    try t.expectError(error.TrailingJpegBytes, budget.consume(t.allocator, &tail, jpg));
    try t.expectEqualDeep(before, budget.report);
    budget.options.jpeg.?.structure.allow_trailing_bytes = true;
    try budget.consume(t.allocator, &tail, jpg);
    try t.expectEqual(@as(usize, 2), budget.report.jpeg.images);
}

test "HWP JPEG forwards independent decoder limits in both processes" {
    for ([_][]const u8{ &fixture.sequential, &fixture.progressive }) |raw| {
        for (0..5) |which| {
            var bounded = options;
            switch (which) {
                0 => bounded.max_samples = 0,
                1 => bounded.structure.max_scans = 0,
                2 => bounded.render.max_rgb_bytes = 2,
                3 => bounded.structure.markers.max_bytes = raw.len - 1,
                4 => {
                    bounded.max_sequential_blocks = 0;
                    bounded.max_progressive_block_visits = 0;
                },
                else => unreachable,
            }
            var budget: images.Budget = .{ .options = .{ .jpeg = bounded } };
            try t.expectError(error.LimitExceeded, budget.consume(t.allocator, raw, jpg));
            try t.expectEqualDeep(images.Report{}, budget.report);
        }
    }
}

fn detached(a: std.mem.Allocator, raw: []const u8) !void {
    var report = blk: {
        const bytes = try @import("image_fixture.zig").withExtension(a, raw, 2, "jpg");
        defer a.free(bytes);
        break :blk try container.inspect(a, bytes, .{ .images = .{ .jpeg = options, .max_total_jpeg_rgb_bytes = 6 }, .document = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } } });
    };
    defer report.deinit(a);
    try t.expectEqual(@as(usize, 2), report.binary_data.decoded);
    try t.expectEqual(@as(usize, 2), report.images.?.jpeg.images);
    try t.expectEqual(@as(usize, 6), report.images.?.jpeg.rgb_bytes);
    try t.expectEqual(@as(usize, 0), report.uninspected_streams);
}
test "HWP JPEG container report outlives all CFB and RGB buffers" {
    for ([_][]const u8{ &fixture.sequential, &fixture.progressive }) |raw| {
        try detached(t.allocator, raw);
        try t.checkAllAllocationFailures(t.allocator, detached, .{raw});
    }
}

test "HWP JPEG counters reject overflow without modifying accumulated report" {
    inline for (std.meta.fields(jpeg.Report)) |field| {
        var prior: jpeg.Report = .{};
        @field(prior, field.name) = std.math.maxInt(usize);
        var added: jpeg.Report = .{};
        @field(added, field.name) = 1;
        try t.expectError(error.LimitExceeded, prior.plus(added));
    }
    var budget: images.Budget = .{ .options = .{ .jpeg = options } };
    budget.report.jpeg.images = std.math.maxInt(usize);
    const before = budget.report;
    try t.expectError(error.LimitExceeded, budget.consume(t.allocator, &fixture.sequential, jpg));
    try t.expectEqualDeep(before, budget.report);
}
