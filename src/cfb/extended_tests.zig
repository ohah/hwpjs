const std = @import("std");
const cfb = @import("reader.zig");
const Options = @import("types.zig").Options;
const fixture = @import("extended_test_fixture.zig");

fn allocationCase(a: std.mem.Allocator, bytes: []const u8) !void {
    var file = try cfb.File.open(a, bytes, .{});
    defer file.deinit();
    // '!' exercises the fallback control-character alias, not the direct match.
    const first = try file.readStream(a, "!");
    const second = try file.readStream(a, "y");
    try std.testing.expectEqual(@as(usize, 4096), first.len);
    try std.testing.expectEqual(@as(usize, 4096), second.len);
    for (first, 0..) |byte, i| try std.testing.expectEqual(@as(u8, @intCast(i % 251)), byte);
    for (second, 0..) |byte, i| try std.testing.expectEqual(@as(u8, @intCast((i + 4096) % 251)), byte);
    try std.testing.expectEqual(@as(?usize, null), try file.find(a, "missing"));
}

test "regular streams, deep trees, fallback search and multiple DIFAT allocation failures" {
    for ([_]bool{ false, true }) |extended| {
        const bytes = try fixture.make(std.testing.allocator, extended);
        defer std.testing.allocator.free(bytes);
        try std.testing.checkAllAllocationFailures(std.testing.allocator, allocationCase, .{bytes});
    }
}

test "all resource limits at nonzero below equal and above boundaries" {
    const bytes = try fixture.make(std.testing.allocator, false);
    defer std.testing.allocator.free(bytes);
    // 21 storage paths of lengths 2,4,...42; two 43-byte stream paths;
    // nine unused directory entries contribute '/' each.
    const path_total = 21 * 22 + 2 * 43 + 9;
    inline for (.{ .{ "max_input_bytes", bytes.len }, .{ "max_stream_bytes", @as(usize, 4096) }, .{ "max_total_stream_bytes", @as(usize, 8192) }, .{ "max_entries", @as(usize, 32) }, .{ "max_path_bytes", @as(usize, path_total) } }) |boundary| {
        for (0..3) |delta| {
            var options: Options = .{};
            @field(options, boundary[0]) = boundary[1] - 1 + delta;
            if (delta == 0) {
                try std.testing.expectError(error.LimitExceeded, cfb.File.open(std.testing.allocator, bytes, options));
            } else {
                var file = try cfb.File.open(std.testing.allocator, bytes, options);
                defer file.deinit();
                var total: usize = 0;
                for (file.entries) |entry| total += entry.path.len;
                try std.testing.expectEqual(@as(usize, path_total), total);
            }
        }
    }
}

test "shared regular and mini sectors reject with the precise ownership error" {
    const bytes = try fixture.make(std.testing.allocator, false);
    defer std.testing.allocator.free(bytes);
    // Directory begins at byte 1024; both streams now claim sector 9.
    fixture.put(u32, bytes, 1024 + 22 * 128 + 116, 9);
    try std.testing.expectError(error.CyclicOrSharedSector, cfb.File.open(std.testing.allocator, bytes, .{}));
    var mini = @import("tests.zig").miniFile();
    @memcpy(mini[1280..1408], mini[1152..1280]);
    fixture.put(u16, &mini, 1280, 'y');
    fixture.put(u32, &mini, 1152 + 72, 2);
    try std.testing.expectError(error.CyclicOrSharedSector, cfb.File.open(std.testing.allocator, &mini, .{}));
}

test "root mini stream capacity is included in the individual stream limit" {
    const bytes = @import("tests.zig").miniFile();
    try std.testing.expectError(error.LimitExceeded, cfb.File.open(std.testing.allocator, &bytes, .{ .max_stream_bytes = 63 }));
    for ([_]usize{ 64, 65 }) |limit| {
        var file = try cfb.File.open(std.testing.allocator, &bytes, .{ .max_stream_bytes = limit, .max_total_stream_bytes = 1 });
        defer file.deinit();
        try std.testing.expectEqualStrings("x", try file.readStream(std.testing.allocator, "x"));
    }
}
