const std = @import("std");
const t = std.testing;
const source = @import("table_background_source_bytes.zig");
const zip = @import("../zip/archive.zig");
const manifest = @import("content_manifest.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const head_prefix = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><h:refList><h:borderFills><h:borderFill id='4'><c:fillBrush>";
const head_suffix = "</c:fillBrush></h:borderFill></h:borderFills></h:refList></h:head>";
const body = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:tbl><p:tr><p:tc borderFillIDRef='4'><p:subList/></p:tc><p:tc><p:subList/></p:tc></p:tr></p:tbl></s:sec>";

fn items(comptime target: ?usize, comptime href: []const u8) manifest.Manifest {
    return comptime .{ .items = @constCast(&[_]manifest.Item{.{ .id = @constCast("image1"), .href = @constCast(href), .media_type = @constCast("image/png"), .embedded = target != null, .entry_index = target }}), .spine = @constCast(&[_]manifest.SpineRef{}), .xml_bytes = 0 };
}
fn header(a: std.mem.Allocator, image: []const u8) !Tree {
    const xml = try std.mem.concat(a, u8, &.{ head_prefix, image, head_suffix });
    defer a.free(xml);
    return @import("header_tree.zig").parse(a, xml, 0, .{});
}

test "table background source reads exact owned payload with limits and allocation failures" {
    const a = t.allocator;
    const bytes = try @import("test_package_fixture.zig").storedZip(a, &.{.{ .name = "BinData/img.png", .data = "raw-image-source" }});
    defer a.free(bytes);
    var archive = try zip.open(a, bytes, .{});
    defer archive.deinit();
    var section = try @import("section_tree.zig").parse(a, body, 0, 1, .{});
    defer section.deinit(a);
    var head = try header(a, "<c:imgBrush><c:img binaryItemIDRef='image&#49;'/></c:imgBrush>");
    defer head.deinit(a);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: zip.Archive, section_tree: *const Tree, header_tree: *const Tree) !void {
            var view = original;
            view.allocator = allocator;
            const output = try source.readTrees(allocator, view, items(0, "BinData/img.png"), section_tree, header_tree, 4, 16);
            defer allocator.free(output);
            try t.expectEqualStrings("raw-image-source", output);
            output[0] = 'X';
            const next = try source.readTrees(allocator, view, items(0, "BinData/img.png"), section_tree, header_tree, 4, 16);
            defer allocator.free(next);
            try t.expectEqualStrings("raw-image-source", next);
        }
    }.run, .{ archive, &section, &head });
    try t.expectError(error.LimitExceeded, source.readTrees(a, archive, items(0, "BinData/img.png"), &section, &head, 4, 15));
    try t.expectError(error.MissingTableBackgroundCell, source.readTrees(a, archive, items(0, "BinData/img.png"), &section, &head, 3, 16));
    try t.expectError(error.MissingTableBackgroundStyle, source.readTrees(a, archive, items(0, "BinData/img.png"), &section, &head, 6, 16));
    try t.expectError(error.InvalidImageLinkReport, source.readTrees(a, archive, items(1, "BinData/img.png"), &section, &head, 4, 16));
    try t.expectError(error.InvalidImageLinkReport, source.readTrees(a, archive, items(0, "BinData/wrong.png"), &section, &head, 4, 16));
    try t.expectError(error.ExternalTableBackgroundImage, source.readTrees(a, archive, items(null, "https://example.invalid/image.png"), &section, &head, 4, 16));
    var entry = [_]zip.Entry{archive.entries[0]};
    var invalid_archive = archive;
    invalid_archive.entries = &entry;
    entry[0].crc32 ^= 1;
    try t.expectError(error.InvalidCrc, source.readTrees(a, invalid_archive, items(0, "BinData/img.png"), &section, &head, 4, 16));
    entry[0] = archive.entries[0];
    entry[0].uncompressed_size -= 1;
    try t.expectError(error.InvalidUncompressedSize, source.readTrees(a, invalid_archive, items(0, "BinData/img.png"), &section, &head, 4, 16));
    entry[0] = archive.entries[0];
    entry[0].method = 99;
    try t.expectError(error.UnsupportedCompression, source.readTrees(a, invalid_archive, items(0, "BinData/img.png"), &section, &head, 4, 16));
}

test "table background source rejects absent missing filename and ambiguous image references" {
    const a = t.allocator;
    const bytes = try @import("test_package_fixture.zig").storedZip(a, &.{.{ .name = "BinData/img.png", .data = "raw-image-source" }});
    defer a.free(bytes);
    var archive = try zip.open(a, bytes, .{});
    defer archive.deinit();
    var section = try @import("section_tree.zig").parse(a, body, 0, 1, .{});
    defer section.deinit(a);
    inline for (.{
        .{ "<c:imgBrush><c:img/></c:imgBrush>", error.MissingTableBackgroundImage },
        .{ "<c:imgBrush><c:img binaryItemIDRef=''/></c:imgBrush>", error.MissingTableBackgroundImage },
        .{ "<c:imgBrush><c:img binaryItemIDRef='missing'/></c:imgBrush>", error.MissingTableBackgroundImage },
        .{ "<c:imgBrush><c:img binaryItemIDRef='BinData/img.png'/></c:imgBrush>", error.MissingTableBackgroundImage },
        .{ "<c:winBrush faceColor='#FFFFFF'/>", error.MissingTableBackgroundImage },
        .{ "<c:imgBrush><c:img binaryItemIDRef='image1'/><c:img binaryItemIDRef='image1'/></c:imgBrush>", error.AmbiguousTableBackgroundImage },
    }) |case| {
        var head = try header(a, case[0]);
        defer head.deinit(a);
        try t.expectError(case[1], source.readTrees(a, archive, items(0, "BinData/img.png"), &section, &head, 4, 16));
    }
}

test "table background source actual GIF matches independent ZIP hash after session close" {
    const a = t.allocator;
    const original = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpx/el-school-001.hwpx", a, .limited(16_000_000));
    defer a.free(original);
    const bytes = block: {
        var session = try @import("editor_session.zig").open(a, original, .{});
        defer session.deinit();
        var report = try @import("table_border_sources.zig").read(a, &session, 0);
        defer report.deinit(a);
        var selected: ?usize = null;
        for (report.cells) |cell| {
            if (cell.style_index) |index| {
                if (report.styles[index].id != 8) continue;
                try t.expect(selected == null);
                selected = cell.list_node;
            }
        }
        const list = selected orelse return error.MissingActualBackgroundFixture;
        try t.expectError(error.InvalidSectionIndex, source.read(a, &session, session.sections.len, list, 16_000_000));
        try t.expectError(error.LimitExceeded, source.read(a, &session, 0, list, 9957));
        const result = try source.read(a, &session, 0, list, 9958);
        errdefer a.free(result);
        const saved = try session.save();
        defer a.free(saved);
        try t.expectEqualSlices(u8, original, saved);
        break :block result;
    };
    defer a.free(bytes);
    try t.expectEqual(@as(usize, 9958), bytes.len);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &digest, .{});
    const hex = std.fmt.bytesToHex(digest, .lower);
    try t.expectEqualStrings("3751876a9b1a524dc2a564927c2db32bf8fd4bf3c229634b7bb03935a1b99f9b", &hex);
}
