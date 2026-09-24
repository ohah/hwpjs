const std = @import("std");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const hpf = "<p:package xmlns:p='http://www.idpf.org/2007/opf/'><p:manifest>" ++
    "<p:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
    "<p:item id='h2' href='Contents/header.xml' media-type='application/xml'/>" ++
    "<p:item id='b' href='BinData/image.png' media-type='image/png'/>" ++
    "<p:item id='e' href='https://example.invalid/image' media-type='image/png' isEmbeded='0'/>" ++
    "</p:manifest><p:spine><p:itemref idref='h'/></p:spine></p:package>";
const sources = [_]fixture.Source{
    .{ .name = "mimetype", .data = package.mime },
    .{ .name = "META-INF/container.xml", .data = fixture.package_container },
    .{ .name = "Contents/content.hpf", .data = hpf },
    .{ .name = "Contents/header.xml", .data = "<head/>" },
    .{ .name = "BinData/image.png", .data = "not actually a PNG" },
    .{ .name = "unknown.bin", .data = "unreferenced" },
};

test "HWPX payload integrity decodes every ZIP member and reports manifest coverage" {
    const a = std.testing.allocator;
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var doc = try package.inspectDocument(a, bytes, .{});
    defer doc.deinit(a);
    var report = try doc.inspectPayloadIntegrity(a, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(sources.len, report.validated_entries);
    try std.testing.expectEqual(@as(usize, 2), report.manifested_entries);
    try std.testing.expectEqual(@as(usize, 1), report.external_items);
    try std.testing.expectEqual(@as(usize, 1), report.duplicate_manifest_bindings);
    try std.testing.expectEqualSlices(usize, &.{ 0, 1, 2, 5 }, report.unmanifested_entries);
    var size: usize = 0;
    for (sources) |source| size += source.data.len;
    try std.testing.expectEqual(size, report.decoded_bytes);
}

test "HWPX payload integrity catches corrupt unselected and BinData entries" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "unknown.bin", "BinData/image.png" }) |name| {
        const bytes = try fixture.storedZip(a, &sources);
        defer a.free(bytes);
        var doc = try package.inspectDocument(a, bytes, .{});
        defer doc.deinit(a);
        const entry = doc.archive.find(name) orelse return error.MissingEntry;
        const offset = @intFromPtr(entry.compressed.ptr) - @intFromPtr(bytes.ptr);
        bytes[offset] ^= 1;
        try std.testing.expectError(error.InvalidCrc, doc.inspectPayloadIntegrity(a, .{}));
    }
}

test "HWPX payload integrity enforces per-entry and shared decoded byte limits" {
    const a = std.testing.allocator;
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var doc = try package.inspectDocument(a, bytes, .{});
    defer doc.deinit(a);
    try std.testing.expectError(error.LimitExceeded, doc.inspectPayloadIntegrity(a, .{ .max_entry_bytes = 1 }));
    try std.testing.expectError(error.LimitExceeded, doc.inspectPayloadIntegrity(a, .{ .max_total_decoded_bytes = package.mime.len }));
    var zero = try doc.inspectPayloadIntegrity(a, .{});
    zero.deinit(a);
}

test "HWPX payload integrity uses the archive allocator and owns its report" {
    const bytes = try fixture.storedZip(std.testing.allocator, &sources);
    defer std.testing.allocator.free(bytes);
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    const a = checked.allocator();
    var doc = try package.inspectDocument(a, bytes, .{});
    var report = try doc.inspectPayloadIntegrity(std.testing.allocator, .{});
    doc.deinit(a);
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
    try std.testing.expectEqual(@as(usize, 4), report.unmanifested_entries.len);
    report.deinit(std.testing.allocator);
}

test "HWPX payload integrity releases every allocation failure" {
    const bytes = try fixture.storedZip(std.testing.allocator, &sources);
    defer std.testing.allocator.free(bytes);
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, input: []const u8) !void {
            var doc = try package.inspectDocument(a, input, .{});
            defer doc.deinit(a);
            var report = try doc.inspectPayloadIntegrity(a, .{});
            report.deinit(a);
        }
    }.run, .{bytes});
}
