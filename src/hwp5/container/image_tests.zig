const std = @import("std");
const t = std.testing;
const images = @import("images.zig");
const container = @import("validation.zig");
const opts: container.Options = .{ .document = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } } };
fn inspect(a: std.mem.Allocator, bytes: []const u8, selected: bool) !void {
    var options = opts;
    if (selected) options.images = .{ .max_total_pixel_bytes = 4 };
    var r = try container.inspect(a, bytes, options);
    defer r.deinit(a);
    try t.expectEqual(@as(usize, 2), r.binary_data.decoded);
    try t.expectEqual(@as(usize, 0), r.uninspected_streams);
    try t.expectEqual(selected, r.images != null);
    if (r.images) |report| {
        try t.expectEqual(@as(usize, 2), report.binaries);
        try t.expectEqual(@as(usize, 2), report.png_images);
        try t.expectEqual(@as(usize, 4), report.pixel_bytes);
        try t.expectEqual(@as(usize, 0), report.unhandled_binaries);
        try t.expect(report.semantics_deferred);
    }
}
fn rejected(a: std.mem.Allocator, bytes: []const u8, options: container.Options, expected: anyerror) !void {
    var r = container.inspect(a, bytes, options) catch |err| {
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(expected, err);
        return;
    };
    defer r.deinit(a);
    return error.TestExpectedError;
}
test "HWP container PNG inspection shares budgets across repeated references" {
    const png = try @import("../../image/png/pixels_fixture.zig").image(t.allocator, 0);
    defer t.allocator.free(png);
    const bytes = try @import("image_fixture.zig").make(t.allocator, png, 2);
    defer t.allocator.free(bytes);
    for ([_]bool{ false, true }) |selected| {
        try inspect(t.allocator, bytes, selected);
        try t.checkAllAllocationFailures(t.allocator, inspect, .{ bytes, selected });
    }
    var options = opts;
    options.images = .{ .max_total_pixel_bytes = 3 };
    try t.checkAllAllocationFailures(t.allocator, rejected, .{ bytes, options, error.LimitExceeded });
    options.images = .{ .max_binaries = 1 };
    try rejected(t.allocator, bytes, options, error.LimitExceeded);
}
test "HWP PNG budget detects signatures and retains state after rejection" {
    const png = try @import("../../image/png/pixels_fixture.zig").image(t.allocator, 0);
    defer t.allocator.free(png);
    var budget: images.Budget = .{ .options = .{ .max_total_pixel_bytes = 4 } };
    try budget.consume(t.allocator, png, null);
    try budget.consume(t.allocator, png, &.{ 'j', 0, 'p', 0, 'g', 0 });
    try t.expectEqual(@as(usize, 1), budget.report.png_extension_disagreements);
    const before = budget.report;
    try t.expectError(error.LimitExceeded, budget.consume(t.allocator, png, &.{ 'P', 0, 'N', 0, 'G', 0 }));
    try t.expectEqualDeep(before, budget.report);
    try t.expectError(error.UnexpectedEnd, budget.consume(t.allocator, "bad", &.{ 'P', 0, 'N', 0, 'G', 0 }));
    try t.expectEqualDeep(before, budget.report);
    try budget.consume(t.allocator, "opaque OLE", null);
    try t.expectEqual(@as(usize, 1), budget.report.unhandled_binaries);
    try t.expectEqual(@as(usize, 3), budget.report.binaries);
}
test "HWP container malformed declared PNG is rejected only when selected" {
    const bytes = try @import("image_fixture.zig").make(t.allocator, "bad", 2);
    defer t.allocator.free(bytes);
    try inspect(t.allocator, bytes, false);
    var options = opts;
    options.images = .{};
    try t.checkAllAllocationFailures(t.allocator, rejected, .{ bytes, options, error.UnexpectedEnd });
}

fn detached(a: std.mem.Allocator) !void {
    var report = blk: {
        const png = try @import("../../image/png/pixels_fixture.zig").image(a, 0);
        defer a.free(png);
        const bytes = try @import("image_fixture.zig").make(a, png, 2);
        defer a.free(bytes);
        var options = opts;
        options.images = .{};
        break :blk try container.inspect(a, bytes, options);
    };
    defer report.deinit(a);
    try t.expectEqual(@as(usize, 2), report.images.?.png_images);
    try t.expectEqual(@as(usize, 4), report.images.?.pixel_bytes);
    try t.expectEqual(@as(usize, 2), report.binary_data.decoded);
}
test "HWP container image report outlives CFB and all temporary payloads" {
    try detached(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, detached, .{});
}
test "HWP container propagates PNG CRC errors without raw fallback" {
    const png = try @import("../../image/png/pixels_fixture.zig").image(t.allocator, 0);
    defer t.allocator.free(png);
    png[29] ^= 1; // IHDR CRC, leaving its length and image header intact.
    const bytes = try @import("image_fixture.zig").make(t.allocator, png, 2);
    defer t.allocator.free(bytes);
    try inspect(t.allocator, bytes, false);
    var options = opts;
    options.images = .{};
    try rejected(t.allocator, bytes, options, error.InvalidChecksum);
    try t.checkAllAllocationFailures(t.allocator, rejected, .{ bytes, options, error.InvalidChecksum });
}

fn profileConnection(a: std.mem.Allocator) !void {
    const raw = try @import("../../image/icc/v2_text_fixture.zig").make(a);
    defer a.free(raw);
    const payload = try @import("../../image/png/embedded_profile_fixture.zig").payload(a, "P", raw);
    defer a.free(payload);
    const png = try @import("../../image/png/pixels_fixture.zig").withEarlyMetadata(a, 0, &.{.{ .name = "iCCP", .bytes = payload }});
    defer a.free(png);
    const bytes = try @import("image_fixture.zig").make(a, png, 2);
    defer a.free(bytes);
    var options = opts;
    options.images = .{ .png = .{ .profile = .{ .layout = .bounded, .payloads = .{ .edition = .v2_2001 } } } };
    var report = try container.inspect(a, bytes, options);
    defer report.deinit(a);
    try t.expectEqual(@as(usize, 2), report.images.?.profile_images);
    try t.expectEqual(@as(usize, 2), report.images.?.color_deferred_images);
    try t.expectEqual(@as(usize, 2), report.images.?.ancillary_chunks_deferred);
    // The raw v2 fixture deliberately contains an isolated surrogate.
    options.images.?.png.profile.payloads.?.v2_unicode_utf16be = true;
    try rejected(a, bytes, options, error.InvalidUnicodeEncoding);
}
test "HWP container forwards explicit ICC policies and preserves deferred evidence" {
    try profileConnection(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, profileConnection, .{});
}
