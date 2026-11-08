const std = @import("std");
const replacement = @import("picture_resource_replacement.zig");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");
const a = std.testing.allocator;
const section = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><p:p><p:run><p:pic opaque='keep'><p:sz width='123' height='456'/><c:img binaryItemIDRef='shared'/></p:pic><p:pic><c:img binaryItemIDRef='shared'/></p:pic></p:run></p:p></s:sec>";
fn sample(allocator: std.mem.Allocator) ![]u8 {
    const png = try @import("../image/png/pixels_fixture.zig").image(allocator, 1);
    defer allocator.free(png);
    const hpf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest><o:item id='h' href='Contents/header.xml' media-type='application/xml'/><o:item id='s' href='Contents/section0.xml' media-type='application/xml'/><o:item id='shared' href='BinData/shared.png' media-type='image/png'/></o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
    return fixture.storedZip(allocator, &.{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = hpf },
        .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'/>" },
        .{ .name = "Contents/section0.xml", .data = section },
        .{ .name = "BinData/shared.png", .data = png },
        .{ .name = "Preview/PrvText.txt", .data = "보존" },
    });
}
fn sha(bytes: []const u8) [32]u8 {
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &digest, .{});
    return digest;
}

test "picture resource replacement shared resource isolation and geometry preservation" {
    const input = try sample(a);
    defer a.free(input);
    const png = try @import("../image/png/pixels_fixture.zig").image(a, 2);
    defer a.free(png);
    const before = sha(input);
    var result = try replacement.prepare(a, input, 0, 3, png, .{});
    defer result.deinit(a);
    try std.testing.expectEqual(before, sha(input));
    var document = try package.inspectDocument(a, result.bytes, .{});
    defer document.deinit(a);
    var tree = try document.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    const links = @import("picture_image_links.zig");
    var sites = try links.inspectSections(a, document.manifest, &.{tree}, .{});
    defer sites.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), sites.sites.len);
    try std.testing.expectEqualStrings(result.resource_id, sites.sites[0].id.?);
    try std.testing.expectEqualStrings("shared", sites.sites[1].id.?);
    try std.testing.expect(std.mem.indexOf(u8, tree.source, "<p:sz width='123' height='456'/>") != null);
    const new = try document.archive.decode(document.archive.find(result.resource_path).?, 4096);
    defer a.free(new);
    try std.testing.expectEqualSlices(u8, png, new);
    var original = try package.inspectDocument(a, input, .{});
    defer original.deinit(a);
    const old = try original.archive.decode(original.archive.find("BinData/shared.png").?, 4096);
    defer a.free(old);
    const kept = try document.archive.decode(document.archive.find("BinData/shared.png").?, 4096);
    defer a.free(kept);
    try std.testing.expectEqualSlices(u8, old, kept);
    try std.testing.expectEqualStrings("image/png", result.media_type);
}

test "picture resource replacement rejects format corruption limits and wrong target atomically" {
    const input = try sample(a);
    defer a.free(input);
    const png = try @import("../image/png/pixels_fixture.zig").image(a, 2);
    defer a.free(png);
    const before = sha(input);
    try std.testing.expectError(error.UnsupportedReplacementImageFormat, replacement.prepare(a, input, 0, 3, "unknown", .{}));
    try std.testing.expectError(error.ImageByteLimitExceeded, replacement.prepare(a, input, 0, 3, png, .{ .max_image_bytes = png.len - 1 }));
    try std.testing.expectError(error.LimitExceeded, replacement.prepare(a, input, 0, 3, png, .{ .max_output_bytes = 1 }));
    try std.testing.expectError(error.InvalidPictureDisplayNode, replacement.prepare(a, input, 0, 0, png, .{}));
    png[29] ^= 1;
    try std.testing.expectError(error.InvalidChecksum, replacement.prepare(a, input, 0, 3, png, .{}));
    try std.testing.expectEqual(before, sha(input));
}

test "picture resource replacement allocation failures leave borrowed source untouched" {
    const input = try sample(a);
    defer a.free(input);
    const png = try @import("../image/png/pixels_fixture.zig").image(a, 2);
    defer a.free(png);
    const before = sha(input);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, image: []const u8) !void {
            var result = try replacement.prepare(allocator, bytes, 0, 3, image, .{});
            defer result.deinit(allocator);
        }
    }.run, .{ input, png });
    try std.testing.expectEqual(before, sha(input));
}

test "picture resource replacement actual Noori four images preserve three and reopen" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwpx", a, .limited(16 * 1024 * 1024));
    defer a.free(input);
    const before = sha(input);
    const png = try @import("../image/png/pixels_fixture.zig").image(a, 77);
    defer a.free(png);
    var result = try replacement.prepare(a, input, 0, 31, png, .{});
    defer result.deinit(a);
    var old = try package.inspectDocument(a, input, .{});
    defer old.deinit(a);
    var reopened = try package.inspectDocument(a, result.bytes, .{});
    defer reopened.deinit(a);
    var tree = try reopened.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("picture_image_links.zig").inspectSections(a, reopened.manifest, &.{tree}, .{});
    defer sites.deinit(a);
    try std.testing.expectEqual(@as(usize, 4), sites.sites.len);
    var changed: usize = 0;
    for (sites.sites) |site| {
        const item = reopened.manifest.items[site.target.item_index.?];
        const actual = try reopened.archive.decode(reopened.archive.entries[item.entry_index.?], 8 * 1024 * 1024);
        defer a.free(actual);
        if (site.picture_element_index == 31) {
            try std.testing.expectEqualSlices(u8, png, actual);
            try std.testing.expectEqualStrings(result.resource_path, item.href);
            changed += 1;
        } else {
            const original = try old.archive.decode(old.archive.find(item.href).?, 8 * 1024 * 1024);
            defer a.free(original);
            try std.testing.expectEqual(sha(original), sha(actual));
        }
    }
    try std.testing.expectEqual(@as(usize, 1), changed);
    try std.testing.expectEqual(before, sha(input));
}

test "picture resource replacement repeated copy on write avoids collisions and detects JPEG metadata" {
    const input = try sample(a);
    defer a.free(input);
    const png = try @import("../image/png/pixels_fixture.zig").image(a, 2);
    defer a.free(png);
    var first = try replacement.prepare(a, input, 0, 3, png, .{});
    defer first.deinit(a);
    const source = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwpx", a, .limited(16 * 1024 * 1024));
    defer a.free(source);
    var original = try package.inspectDocument(a, source, .{});
    defer original.deinit(a);
    const jpeg = jpeg: {
        for (original.manifest.items) |item| {
            if ((std.ascii.eqlIgnoreCase(item.media_type, "image/jpeg") or std.ascii.eqlIgnoreCase(item.media_type, "image/jpg"))) {
                const entry = item.entry_index orelse return error.MissingJpegFixture;
                break :jpeg try original.archive.decode(original.archive.entries[entry], 8 * 1024 * 1024);
            }
        }
        return error.MissingJpegFixture;
    };
    defer a.free(jpeg);
    var second = try replacement.prepare(a, first.bytes, 0, 3, jpeg, .{});
    defer second.deinit(a);
    try std.testing.expect(!std.mem.eql(u8, first.resource_id, second.resource_id));
    try std.testing.expectEqualStrings("image/jpeg", second.media_type);
    try std.testing.expect(std.mem.endsWith(u8, second.resource_path, ".jpg"));
    var document = try package.inspectDocument(a, second.bytes, .{});
    defer document.deinit(a);
    try std.testing.expect(document.archive.find("BinData/shared.png") != null);
    try std.testing.expect(document.archive.find(first.resource_path) != null);
    const bytes = try document.archive.decode(document.archive.find(second.resource_path).?, 8 * 1024 * 1024);
    defer a.free(bytes);
    try std.testing.expectEqualSlices(u8, jpeg, bytes);
}

test "picture resource replacement ABI output preserves alias input and previous output on failure" {
    const input = try sample(a);
    defer a.free(input);
    const png = try @import("../image/png/pixels_fixture.zig").image(a, 88);
    defer a.free(png);
    var output: @import("picture_resource_replacement_output.zig").Output = .{ .allocator = a };
    defer output.clear();
    try output.replace(input, 0, 3, png);
    const before = sha(output.bytes.?);
    const pointer = output.bytes.?.ptr;
    try std.testing.expectError(error.UnsupportedReplacementImageFormat, output.replace(output.bytes.?, 0, 3, "unknown"));
    try std.testing.expectEqual(pointer, output.bytes.?.ptr);
    try std.testing.expectEqual(before, sha(output.bytes.?));
    try output.replace(output.bytes.?, 0, 3, png);
    var reopened = try package.inspectDocument(a, output.bytes.?, .{});
    defer reopened.deinit(a);
    output.clear();
    output.clear();
    try std.testing.expectEqual(@as(?[]u8, null), output.bytes);
}

test "picture resource replacement ABI outputs have independent ownership" {
    const input = try sample(a);
    defer a.free(input);
    const png = try @import("../image/png/pixels_fixture.zig").image(a, 89);
    defer a.free(png);
    const Output = @import("picture_resource_replacement_output.zig").Output;
    var first: Output = .{ .allocator = a };
    defer first.clear();
    var second: Output = .{ .allocator = a };
    defer second.clear();
    try first.replace(input, 0, 3, png);
    try second.replace(input, 0, 3, png);
    const before = sha(second.bytes.?);
    first.clear();
    try std.testing.expectEqual(before, sha(second.bytes.?));
}
