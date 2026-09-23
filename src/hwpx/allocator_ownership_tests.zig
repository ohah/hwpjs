const std = @import("std");
const package = @import("package.zig");

test "HWPX inspection reports can use an allocator distinct from their archive" {
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/example.hwpx", std.testing.allocator, .limited(1_000_000));
    defer std.testing.allocator.free(bytes);
    var archive_alloc: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = archive_alloc.deinit();
    var report_alloc: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = report_alloc.deinit();
    const aa = archive_alloc.allocator();
    const ra = report_alloc.allocator();
    var document = try package.inspectDocument(aa, bytes, .{});
    var version = try document.inspectVersion(ra, .{});
    version.deinit(ra);
    var protection = try document.inspectProtection(ra, .{});
    protection.deinit(ra);
    var structure = try document.inspectStructure(ra, .{});
    structure.deinit(ra);
    var resources = try document.inspectHeaderResources(ra, .{});
    resources.deinit(ra);
    _ = try document.inspectReferences(ra, .{});
    _ = try document.inspectHeaderReferences(ra, .{});
    var fonts = try document.inspectFontReferences(ra, .{});
    fonts.deinit(ra);
    _ = try document.inspectListReferences(ra, .{});
    var binaries = try document.inspectBinaryReferences(ra, .{});
    binaries.deinit(ra);
    var charts = try document.inspectChartReferences(ra, .{});
    charts.deinit(ra);
    document.deinit(aa);
    try std.testing.expectEqual(@as(usize, 0), archive_alloc.total_requested_bytes);
    try std.testing.expectEqual(@as(usize, 0), report_alloc.total_requested_bytes);
}
