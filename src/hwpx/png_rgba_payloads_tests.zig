const std = @import("std");
const zip = @import("../zip/archive.zig");
const fixture = @import("test_package_fixture.zig");
const manifest = @import("content_manifest.zig");
const payloads = @import("manifest_image_payloads.zig");
const core = @import("image_payloads.zig");
const png_fixture = @import("../image/png/pixels_fixture.zig");

fn sample(a: std.mem.Allocator, options: payloads.Options, corrupt_second: bool) !payloads.Report {
    const first = try png_fixture.withTransparency(a, 0, &.{128});
    defer a.free(first);
    const second = try png_fixture.image(a, 0);
    defer a.free(second);
    if (corrupt_second) second[second.len - 1] ^= 1;
    const sources = [_]fixture.Source{
        .{ .name = "BinData/first.png", .data = first },
        .{ .name = "BinData/second.png", .data = second },
    };
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var archive = try zip.open(a, bytes, .{});
    defer archive.deinit();
    var items = [_]manifest.Item{
        .{ .id = @constCast("first"), .href = @constCast(sources[0].name), .media_type = @constCast("image/png"), .embedded = null, .entry_index = 0 },
        .{ .id = @constCast("second"), .href = @constCast(sources[1].name), .media_type = @constCast("image/png"), .embedded = null, .entry_index = 1 },
    };
    const opf: manifest.Manifest = .{ .items = &items, .spine = @constCast(&[_]manifest.SpineRef{}), .xml_bytes = 0 };
    return payloads.inspect(a, archive, opf, options);
}

test "HWPX PNG RGBA selection keeps scanline and output budgets independent" {
    const a = std.testing.allocator;
    var strict = try sample(a, .{ .max_total_png_rgba_bytes = 0 }, false);
    defer strict.deinit(a);
    try std.testing.expectEqual(@as(usize, 4), strict.png_decoded_bytes);
    try std.testing.expectEqual(@as(usize, 0), strict.png_rgba_bytes);
    try std.testing.expectEqual(core.Inspection.png_scanlines, strict.targets[0].inspection);
    var selected = try sample(a, .{ .png_pixels = .{}, .max_total_png_rgba_bytes = 8, .max_total_png_decoded_bytes = 4 }, false);
    defer selected.deinit(a);
    try std.testing.expectEqual(@as(usize, 4), selected.png_decoded_bytes);
    try std.testing.expectEqual(@as(usize, 8), selected.png_rgba_bytes);
    try std.testing.expectEqual(core.Inspection.png_rgba, selected.targets[0].inspection);
    try std.testing.expectEqual(core.Inspection.png_rgba, selected.targets[1].inspection);
    try std.testing.expectEqual(@as(?anyerror, null), selected.targets[0].inspection_error);
    try std.testing.expectError(error.LimitExceeded, sample(a, .{ .png_pixels = .{}, .max_total_png_rgba_bytes = 7 }, false));
    try std.testing.expectError(error.LimitExceeded, sample(a, .{ .png_pixels = .{ .max_rgba_bytes = 3 } }, false));
    try std.testing.expectError(error.LimitExceeded, sample(a, .{ .png_pixels = .{}, .max_total_png_decoded_bytes = 3 }, false));
}

test "HWPX PNG RGBA failures remain target diagnostics and only successes count" {
    const a = std.testing.allocator;
    var report = try sample(a, .{ .png_pixels = .{} }, true);
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 4), report.png_rgba_bytes);
    try std.testing.expectEqual(@as(usize, 2), report.png_decoded_bytes);
    try std.testing.expectEqual(@as(usize, 1), report.inspection_failures);
    try std.testing.expectEqual(core.Inspection.png_rgba, report.targets[1].inspection);
    try std.testing.expectEqual(error.InvalidChecksum, report.targets[1].inspection_error.?);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            var checked = try sample(allocator, .{ .png_pixels = .{} }, false);
            checked.deinit(allocator);
        }
    }.run, .{});
}
