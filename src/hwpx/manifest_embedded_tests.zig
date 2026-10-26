const std = @import("std");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

fn check(a: std.mem.Allocator, attribute: []const u8, href: []const u8, expected: ?bool) !void {
    const hpf = try std.fmt.allocPrint(a, "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest><o:item id='resource' href='{s}' media-type='application/octet-stream'{s}/></o:manifest><o:spine/></o:package>", .{ href, attribute });
    defer a.free(hpf);
    const bytes = try fixture.storedZip(a, &.{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = hpf },
        .{ .name = "BinData/image.bin", .data = "opaque" },
    });
    defer a.free(bytes);
    const before = try a.dupe(u8, bytes);
    defer a.free(before);
    var doc = try package.inspectDocument(a, bytes, .{});
    defer doc.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), doc.manifest.items.len);
    const item = doc.manifest.items[0];
    try std.testing.expectEqual(expected, item.embedded);
    try std.testing.expectEqual(expected != false, item.entry_index != null);
    try std.testing.expectEqualStrings(href, item.href);
    try std.testing.expectEqualSlices(u8, before, bytes);
}

fn allocationCase(a: std.mem.Allocator) !void {
    try check(a, " isEmbeded=' true '", "BinData/image.bin", true);
    try check(a, " isEmbeded='false'", "https://example.invalid/image.bin", false);
}

test "HWPX manifest embedded Boolean shares XML lexical policy and preserves absence" {
    const a = std.testing.allocator;
    try check(a, "", "BinData/image.bin", null);
    for ([_][]const u8{ "1", "true", " true " }) |raw| {
        const attr = try std.fmt.allocPrint(a, " isEmbeded='{s}'", .{raw});
        defer a.free(attr);
        try check(a, attr, "BinData/image.bin", true);
    }
    for ([_][]const u8{ "0", "false", " false " }) |raw| {
        const attr = try std.fmt.allocPrint(a, " isEmbeded='{s}'", .{raw});
        defer a.free(attr);
        try check(a, attr, "https://example.invalid/image.bin", false);
    }
    for ([_][]const u8{ "TRUE", "FALSE", "maybe", "", "2" }) |raw| {
        const attr = try std.fmt.allocPrint(a, " isEmbeded='{s}'", .{raw});
        defer a.free(attr);
        try std.testing.expectError(error.InvalidEmbeddedValue, check(a, attr, "BinData/image.bin", null));
    }
    try std.testing.expectError(error.InvalidItemHref, check(a, " isEmbeded='true'", "https://example.invalid/image.bin", true));
    try std.testing.expectError(error.InvalidItemHref, check(a, " isEmbeded='true'", "../image.bin", true));
}

test "HWPX manifest embedded Boolean releases partial allocations" {
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}
