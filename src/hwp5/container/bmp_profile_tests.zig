const std = @import("std");
const t = std.testing;
const images = @import("images.zig");
const f = @import("../../image/bmp/profile_fixture.zig");
const options: images.Options = .{ .bmp = .{ .colour_management = .unmanaged, .mask_scaling = .nearest_normalized }, .bmp_profile = .{ .linked = .preserve, .content = .{ .layout = .icc_2022 } } };
fn embedded(a: std.mem.Allocator) ![]u8 {
    const data = try @import("../../image/icc/tag_fixture.zig").make(a, 156, &.{.{ .signature = "text".*, .offset = 144, .size = 12 }});
    defer a.free(data);
    return f.make(a, 0x4d424544, data, 3, 5);
}
fn repeated(a: std.mem.Allocator) !void {
    const raw = try embedded(a);
    defer a.free(raw);
    var b: images.Budget = .{ .options = options };
    b.options.max_total_bmp_profile_bytes = 312;
    for (0..2) |_| try b.consume(a, raw, null);
    try t.expectEqual(@as(usize, 2), b.report.bmp.images);
    try t.expectEqual(@as(usize, 32), b.report.bmp.rgba_bytes);
    try t.expectEqualDeep(@import("bmp_profiles.zig").Report{ .embedded = 2, .stored_bytes = 312, .icc_checked = 2, .icc_tags = 2, .id_not_calculated = 2, .content_deferred = 2 }, b.report.bmp_profile);
    const before = b.report;
    try t.expectError(error.LimitExceeded, b.consume(a, raw, null));
    try t.expectEqualDeep(before, b.report);
    b.options.bmp_profile = null;
    b.options.max_total_bmp_profile_bytes = 0;
    try b.consume(a, raw, null);
    try t.expectEqualDeep(before.bmp_profile, b.report.bmp_profile);
    try t.expectEqual(@as(usize, 3), b.report.bmp.images);
}
test "HWP BMP profile uses independent remaining budget and preserves counters when disabled" {
    try repeated(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, repeated, .{});
}
test "HWP BMP profile link preservation never counts as checked ICC" {
    const raw = try f.make(t.allocator, 0x4c494e4b, "C:\\p.icc\x00", 0, 0);
    defer t.allocator.free(raw);
    var b: images.Budget = .{ .options = options };
    b.options.max_total_bmp_profile_bytes = 9;
    try b.consume(t.allocator, raw, null);
    try t.expectEqualDeep(@import("bmp_profiles.zig").Report{ .linked = 1, .stored_bytes = 9, .content_deferred = 1 }, b.report.bmp_profile);
    const before = b.report;
    try t.expectError(error.LimitExceeded, b.consume(t.allocator, raw, null));
    try t.expectEqualDeep(before, b.report);
    b.options.max_total_bmp_profile_bytes = 100;
    b.options.bmp_profile.?.linked = .reject;
    try t.expectError(error.UnsupportedBmpLinkedProfile, b.consume(t.allocator, raw, null));
    try t.expectEqualDeep(before, b.report);
}
test "HWP BMP profile empty transport and malformed selected ICC remain distinct" {
    const raw = try f.make(t.allocator, 0x4d424544, &.{}, 0, 0);
    defer t.allocator.free(raw);
    var b: images.Budget = .{ .options = options };
    try t.expectError(error.InvalidIccProfileSize, b.consume(t.allocator, raw, null));
    try t.expectEqualDeep(images.Report{}, b.report);
    b.options.bmp_profile.?.content = null;
    try b.consume(t.allocator, raw, null);
    try t.expectEqualDeep(@import("bmp_profiles.zig").Report{ .embedded = 1, .content_deferred = 1 }, b.report.bmp_profile);
    b.options.bmp = null;
    const before = b.report;
    try t.expectError(error.InvalidBmpProfileSelection, b.consume(t.allocator, raw, null));
    try t.expectEqualDeep(before, b.report);
}
test "HWP BMP profile caps precede allocations and overflow never commits partial reports" {
    const raw = try embedded(t.allocator);
    defer t.allocator.free(raw);
    for (0..4) |which| {
        var b: images.Budget = .{ .options = options };
        switch (which) {
            0 => b.options.max_total_bmp_rgba_bytes = 15,
            1 => b.options.max_total_bmp_profile_bytes = 155,
            2 => b.options.bmp_profile.?.max_profile_bytes = 155,
            3 => b.options.bmp_profile.?.content.?.max_tags = 0,
            else => unreachable,
        }
        var failing = t.FailingAllocator.init(t.allocator, .{ .fail_index = 0 });
        try t.expectError(error.LimitExceeded, b.consume(failing.allocator(), raw, null));
        try t.expectEqualDeep(images.Report{}, b.report);
    }
    var b: images.Budget = .{ .options = options };
    b.report.bmp_profile.icc_tags = std.math.maxInt(usize);
    const before = b.report;
    try t.expectError(error.LimitExceeded, b.consume(t.allocator, raw, null));
    try t.expectEqualDeep(before, b.report);
}
fn invalidId(a: std.mem.Allocator) !void {
    const raw = try embedded(a);
    defer a.free(raw);
    raw[157 + 84] = 1;
    var b: images.Budget = .{ .options = options };
    b.consume(a, raw, null) catch |err| switch (err) {
        error.InvalidIccProfileId => {
            try t.expectEqualDeep(images.Report{}, b.report);
            return;
        },
        else => return err,
    };
    return error.UnexpectedProfileSuccess;
}
test "HWP BMP profile ID failure releases ICC descriptors with explicit accounting" {
    try invalidId(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, invalidId, .{});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try invalidId(checked.allocator());
    try repeated(checked.allocator());
    try t.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}
fn detached(a: std.mem.Allocator) !void {
    var report = blk: {
        const raw = try embedded(a);
        defer a.free(raw);
        const bytes = try @import("image_fixture.zig").withExtension(a, raw, 2, "bmp");
        defer a.free(bytes);
        break :blk try @import("validation.zig").inspect(a, bytes, .{ .images = options, .document = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } } });
    };
    defer report.deinit(a);
    try t.expectEqual(@as(usize, 2), report.images.?.bmp_profile.icc_checked);
    try t.expectEqual(@as(usize, 312), report.images.?.bmp_profile.stored_bytes);
    try t.expectEqual(@as(usize, 0), report.uninspected_streams);
}
test "HWP BMP profile scalar report outlives CFB and BinData inputs" {
    try detached(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, detached, .{});
}

test "HWP BMP profile RLE restoration and ICC failure commit neither report" {
    const base = try @import("../../image/bmp/rle_fixture.zig").bitmap(t.allocator, &.{ 1, 0, 0, 1 }, 8, 2, 2);
    defer t.allocator.free(base);
    const data = try @import("../../image/icc/tag_fixture.zig").make(t.allocator, 132, &.{});
    defer t.allocator.free(data);
    const raw = try t.allocator.alloc(u8, base.len + 84 + data.len);
    defer t.allocator.free(raw);
    @memset(raw, 0);
    @memcpy(raw[0..54], base[0..54]);
    @memcpy(raw[138..][0 .. base.len - 54], base[54..]);
    @memcpy(raw[base.len + 84 ..], data);
    f.put(raw, 2, u32, @intCast(raw.len));
    f.put(raw, 10, u32, std.mem.readInt(u32, base[10..14], .little) + 84);
    f.put(raw, 14, u32, 124);
    f.put(raw, 70, u32, 0x4d424544);
    f.put(raw, 126, u32, @intCast(base.len + 70));
    f.put(raw, 130, u32, @intCast(data.len));
    var b: images.Budget = .{ .options = options };
    b.options.bmp.?.rle = @import("../../image/bmp/rle_rgba_fixture.zig").options.rle;
    try b.consume(t.allocator, raw, null);
    try t.expectEqual(@as(usize, 1), b.report.bmp.rle_images);
    try t.expectEqual(@as(usize, 3), b.report.bmp.rle_transparent_pixels);
    try t.expectEqual(@as(usize, 1), b.report.bmp_profile.icc_checked);
    const before = b.report;
    raw[base.len + 84 + 84] = 1;
    try t.expectError(error.InvalidIccProfileId, b.consume(t.allocator, raw, null));
    try t.expectEqualDeep(before, b.report);
    raw[base.len + 84 + 84] = 0;
    b.options.bmp.?.rle.?.raster.completion = .require_full;
    try t.expectError(error.IncompleteBmpRleRaster, b.consume(t.allocator, raw, null));
    try t.expectEqualDeep(before, b.report);
}

test "HWP BMP profile aggregates explicitly selected required and payload reports" {
    const raw = try embedded(t.allocator);
    defer t.allocator.free(raw);
    raw[157 + 12 ..][0..4].* = "mntr".*;
    raw[157 + 16 ..][0..4].* = "RGB ".*;
    raw[157 + 20 ..][0..4].* = "XYZ ".*;
    var b: images.Budget = .{ .options = options };
    b.options.bmp_profile.?.content.?.required = .{ .edition = .v4_2022, .model = .matrix, .measurement_white = .unknown };
    b.options.bmp_profile.?.content.?.payloads = .{ .edition = .v4_2022 };
    try b.consume(t.allocator, raw, null);
    try t.expectEqual(@as(usize, 1), b.report.bmp_profile.required_checked);
    try t.expectEqual(@as(usize, 9), b.report.bmp_profile.missing_tags);
    try t.expectEqual(@as(usize, 1), b.report.bmp_profile.payloads_checked);
    try t.expectEqual(@as(usize, 1), b.report.bmp_profile.unhandled_tags);
    const before = b.report;
    b.options.bmp_profile.?.content.?.payloads.?.max_payload_bytes = 11;
    try t.expectError(error.LimitExceeded, b.consume(t.allocator, raw, null));
    try t.expectEqualDeep(before, b.report);
}
