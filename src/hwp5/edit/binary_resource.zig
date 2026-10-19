//! Resolve a one-based DocInfo ordinal to one exact internal CFB stream.
const std = @import("std");
const Source = @import("../text_source.zig").Source;
pub fn read(a: std.mem.Allocator, source: *const Source, ordinal: u16, limit: usize) ![]u8 {
    if (ordinal == 0) return error.AbsentBinaryResource;
    if (limit > 32 * 1024 * 1024) return error.LimitExceeded;
    const docinfo = try source.decodeDocInfo(a, 32 * 1024 * 1024);
    defer a.free(docinfo);
    var iterator = try @import("../docinfo/reader.zig").Iterator.init(docinfo, source.header.version(), .{});
    var count: usize = 0;
    var selected: ?@import("../docinfo/bin_data.zig").BinData = null;
    while (try iterator.next()) |record| {
        if (record.value != .bin_data) continue;
        count += 1;
        if (count == ordinal) selected = record.value.bin_data;
    }
    if (@import("../docinfo/reference_rules.zig").resolve(.optional_one_based, ordinal, count) != .ordinal) return error.InvalidBinaryResourceOrdinal;
    const item = selected orelse return error.InvalidBinaryResourceOrdinal;
    switch (item.data) {
        .link => return error.ExternalLink,
        .unknown => return error.UnsupportedBinDataType,
        else => {},
    }
    const target = (try item.target(.observed_optional_extension)).?;
    const path = try @import("../container/paths.zig").binary(a, target.id, target.extension_utf16 orelse &.{});
    defer a.free(path);
    const index = try @import("../container/paths.zig").required(&source.file, path, 2);
    return @import("../bin_data_stream.zig").decodeWithPolicy(a, &source.header, item, source.file.entries[index].content, limit, if (source.header.has(.distribution)) .observed_viewtext else .reject);
}
test "binary resource resolves actual picture ordinals bounded bytes and allocation failures" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "sample-5017", "sample-5017-pics", "shapecontainer-2" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(8_000_000));
        defer a.free(input);
        var document = try Source.open(a, input);
        defer document.deinit();
        const raw = try document.decodeSection(a, 0);
        defer a.free(raw);
        const pictures = try @import("picture_sources.zig").read(a, raw, document.header.version(), .base73);
        defer a.free(pictures);
        try std.testing.expect(pictures.len > 0);
        const session = try @import("style_preservation.zig").Session.open(a, input);
        defer session.close();
        for (pictures) |picture| {
            const bytes = try read(a, &document, picture.bin_data_id, 8_000_000);
            defer a.free(bytes);
            try std.testing.expect(bytes.len > 0);
            // Fixture lengths/signatures independently measured with CFB.js + Node zlib.
            const png = std.mem.eql(u8, name, "sample-5017") and picture.bin_data_id == 2;
            try std.testing.expectEqual(@as(usize, if (png) 989 else if (std.mem.eql(u8, name, "shapecontainer-2")) 21310 else 15895), bytes.len);
            if (png) try std.testing.expectEqualSlices(u8, &.{ 0x89, 'P', 'N', 'G', 13, 10, 26, 10 }, bytes[0..8]) else try std.testing.expectEqualSlices(u8, &.{ 0xff, 0xd8, 0xff }, bytes[0..3]);
            const queried = try session.binaryResource(a, picture.bin_data_id, 8_000_000);
            defer a.free(queried);
            try std.testing.expectEqualSlices(u8, bytes, queried);
            try std.testing.expectError(error.LimitExceeded, read(a, &document, picture.bin_data_id, bytes.len - 1));
            // Repeat failure injection once per fixture; all ordinals are read above.
            if (picture.picture_node == pictures[0].picture_node) try @import("../../testing/allocation_failures.zig").check(struct {
                fn run(allocator: std.mem.Allocator, source: *const Source, ordinal: u16, expected: []const u8) !void {
                    const actual = try read(allocator, source, ordinal, 8_000_000);
                    defer allocator.free(actual);
                    try std.testing.expectEqualSlices(u8, expected, actual);
                }
            }.run, .{ &document, picture.bin_data_id, bytes });
        }
        try std.testing.expectError(error.AbsentBinaryResource, read(a, &document, 0, 8_000_000));
        try std.testing.expectError(error.InvalidBinaryResourceOrdinal, read(a, &document, 65535, 8_000_000));
        try std.testing.expectError(error.LimitExceeded, read(a, &document, pictures[0].bin_data_id, 32 * 1024 * 1024 + 1));
    }
}
