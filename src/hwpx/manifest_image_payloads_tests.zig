const std = @import("std");
const zip = @import("../zip/archive.zig");
const fixture = @import("test_package_fixture.zig");
const manifest = @import("content_manifest.zig");
const payloads = @import("manifest_image_payloads.zig");
const package = @import("package.zig");

fn item(id: []const u8, href: []const u8, media: []const u8, entry_index: ?usize) manifest.Item {
    return .{ .id = @constCast(id), .href = @constCast(href), .media_type = @constCast(media), .embedded = if (entry_index == null) false else null, .entry_index = entry_index };
}

fn inspectSample(a: std.mem.Allocator, options: payloads.Options) !payloads.Report {
    const sources = [_]fixture.Source{
        .{ .name = "BinData/unused.svg", .data = "<svg xmlns='http://www.w3.org/2000/svg'/>" },
        .{ .name = "BinData/broken.svg", .data = "<wrong xmlns='http://www.w3.org/2000/svg'/>" },
        .{ .name = "BinData/other.bin", .data = "opaque" },
    };
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var archive = try zip.open(a, bytes, .{});
    defer archive.deinit();
    var items = [_]manifest.Item{
        item("unused", "BinData/unused.svg", "application/octet-stream", 0),
        item("broken", "BinData/broken.svg", "image/svg+xml", 1),
        item("other", "BinData/other.bin", "application/octet-stream", 2),
        item("external", "https://example.invalid/outside.png", "image/png", null),
    };
    const opf: manifest.Manifest = .{ .items = &items, .spine = @constCast(&[_]manifest.SpineRef{}), .xml_bytes = 0 };
    return payloads.inspect(a, archive, opf, options);
}

test "HWPX manifest image payloads include unreferenced candidates and retain failures" {
    const a = std.testing.allocator;
    try std.testing.expect(payloads.isCandidate(item("upper", "BinData/blob.bin", "IMAGE/PNG", null)));
    try std.testing.expect(!payloads.isCandidate(item("other", "BinData/blob.bin", "application/octet-stream", null)));
    var report = try inspectSample(a, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 3), report.sites);
    try std.testing.expectEqual(@as(usize, 1), report.non_embedded_sites);
    try std.testing.expectEqual(@as(usize, 2), report.targets.len);
    try std.testing.expectEqual(@as(usize, 0), report.targets[0].item_index);
    try std.testing.expectEqual(@as(usize, 1), report.targets[1].item_index);
    try std.testing.expectEqual(@as(?anyerror, null), report.targets[0].inspection_error);
    try std.testing.expect(report.targets[1].inspection_error != null);
    try std.testing.expectEqual(@as(usize, 1), report.inspection_failures);
    try std.testing.expectEqual(@as(usize, 1), report.media_mismatches);
    try std.testing.expectEqual(@as(usize, 0), report.unknown_formats);
    var exact = try inspectSample(a, .{ .max_targets = 2 });
    exact.deinit(a);
    try std.testing.expectError(error.LimitExceeded, inspectSample(a, .{ .max_targets = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspectSample(a, .{ .max_total_encoded_bytes = 1 }));
}

test "HWPX manifest image payloads release every allocation failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var report = try inspectSample(a, .{});
            report.deinit(a);
        }
    }.run, .{});
}

test "HWPX manifest image payloads inspect tracked SVG document" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue3460/svg_picture_repro.hwpx", a, .limited(1_000_000));
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectManifestImagePayloads(a, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), report.sites);
    try std.testing.expectEqual(@as(usize, 2), report.targets.len);
    try std.testing.expectEqual(@as(usize, 0), report.inspection_failures);
    try std.testing.expectEqual(@as(usize, 2), report.media_mismatches);
}

test "HWPX manifest image payloads do not charge external items to target limit" {
    const a = std.testing.allocator;
    const bytes = try fixture.storedZip(a, &.{});
    defer a.free(bytes);
    var archive = try zip.open(a, bytes, .{});
    defer archive.deinit();
    var items = [_]manifest.Item{item("external", "https://example.invalid/absent.png", "image/png", null)};
    const opf: manifest.Manifest = .{ .items = &items, .spine = @constCast(&[_]manifest.SpineRef{}), .xml_bytes = 0 };
    var report = try payloads.inspect(a, archive, opf, .{ .max_targets = 0 });
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.sites);
    try std.testing.expectEqual(@as(usize, 1), report.non_embedded_sites);
    try std.testing.expectEqual(@as(usize, 0), report.targets.len);
}

test "HWPX manifest image payloads retain distinct OPF declarations sharing a ZIP entry" {
    const a = std.testing.allocator;
    const sources = [_]fixture.Source{.{ .name = "BinData/shared.svg", .data = "<svg xmlns='http://www.w3.org/2000/svg'/>" }};
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var archive = try zip.open(a, bytes, .{});
    defer archive.deinit();
    var items = [_]manifest.Item{
        item("standard", "BinData/shared.svg", "image/svg+xml", 0),
        item("nonstandard", "BinData/shared.svg", "image/svg", 0),
    };
    const opf: manifest.Manifest = .{ .items = &items, .spine = @constCast(&[_]manifest.SpineRef{}), .xml_bytes = 0 };
    var report = try payloads.inspect(a, archive, opf, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), report.targets.len);
    try std.testing.expectEqual(@as(usize, 1), report.media_mismatches);
    try std.testing.expectEqual(@as(?bool, true), report.targets[0].media_matches);
    try std.testing.expectEqual(@as(?bool, false), report.targets[1].media_matches);
    try std.testing.expectEqual(@as(usize, 0), report.inspection_failures);
}
