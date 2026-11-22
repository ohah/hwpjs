//! Own generated files only: existing blank factory + approved own quadrant raster + insertion contract.
const std = @import("std");
const Session = @import("style_preservation.zig").Session;
const Source = @import("../text_source.zig").Source;
pub const png = @embedFile("../../testing/fixtures/image-source-crop/own-quadrants.png");
pub const jpeg = @embedFile("../../testing/fixtures/image-source-crop/own-quadrants.jpg");
pub fn make(a: std.mem.Allocator, image: []const u8) ![]u8 {
    const input = try @import("../../new_document/hwp5.zig").create(a);
    defer a.free(input);
    const session = try Session.open(a, input);
    defer session.close();
    const raw = try session.copyText(a, 0, 0);
    defer a.free(raw);
    const text = try @import("../../image/image_insertion.zig").utf8FromUtf16(a, raw);
    defer a.free(text);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(input, &digest, .{});
    var result = try @import("image_insertion_file.zig").prepare(a, input, image, .{ .expected_source_sha256 = digest, .target = .{ .section = 0, .paragraph = 0, .unit = 16 }, .expected_text = text, .width = 7200, .height = 3600 });
    defer result.deinit(a);
    return a.dupe(u8, result.bytes);
}
pub fn selector(a: std.mem.Allocator, s: *const Session) !@import("picture_crop.zig").Selector {
    const rows = try s.pictureSources(a, 0, .base73);
    defer a.free(rows);
    if (rows.len != 1) return error.ExpectedOneOwnPicture;
    return .{ .section = 0, .picture_node = @intCast(rows[0].picture_node) };
}
/// Independent record walk. Does not use crop writer, crop parser or observation for expected values.
pub fn assertRaw(a: std.mem.Allocator, input: []const u8, output: []const u8, expected: @import("picture_crop.zig").Rect) !void {
    const t = std.testing;
    var old = try Source.open(a, input);
    defer old.deinit();
    var new = try Source.open(a, output);
    defer new.deinit();
    try t.expectEqual(old.header.version().raw, new.header.version().raw);
    const before = try old.decodeSection(a, 0);
    defer a.free(before);
    const after = try new.decodeSection(a, 0);
    defer a.free(after);
    try t.expectEqual(before.len, after.len);
    var left = @import("../record.zig").Iterator.init(before, .{});
    var right = @import("../record.zig").Iterator.init(after, .{});
    var pictures: usize = 0;
    while (try left.next()) |row| {
        const changed = (try right.next()) orelse return error.MissingSavedRecord;
        try t.expectEqual(row.tag, changed.tag);
        try t.expectEqual(row.level, changed.level);
        if (row.tag == 85) {
            pictures += 1;
            try t.expectEqualSlices(u8, row.payload[0..44], changed.payload[0..44]);
            try t.expectEqualSlices(u8, row.payload[60..], changed.payload[60..]);
            for ([_]i32{ expected.left, expected.top, expected.right, expected.bottom }, 0..) |word, i| try t.expectEqual(word, std.mem.readInt(i32, changed.payload[44 + i * 4 ..][0..4], .little));
        } else try t.expectEqualSlices(u8, row.raw, changed.raw);
    }
    try t.expect((try right.next()) == null);
    try t.expectEqual(@as(usize, 1), pictures);
    try t.expectEqual(old.file.entries.len, new.file.entries.len);
    for (old.file.entries, 0..) |entry, index| {
        if (entry.kind != 2) continue;
        const path = try old.file.rootRelativePath(index);
        if (std.mem.eql(u8, path, "/BodyText/Section0")) continue;
        const found = (try new.file.findExact(path)) orelse return error.MissingPreservedStream;
        try t.expectEqualSlices(u8, entry.content, new.file.entries[found].content);
    }
}
pub fn sizeProtected(a: std.mem.Allocator, input: []const u8) ![]u8 {
    var source = try Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var iterator = @import("../record.zig").Iterator.init(raw, .{});
    var count: usize = 0;
    while (try iterator.next()) |record| if (record.tag == 71 and record.payload.len >= 40 and std.mem.readInt(u32, record.payload[0..4], .little) == @import("../body/control_rules.zig").drawing_id) {
        const at = record.offset + record.raw.len - record.payload.len + 4;
        const flags = std.mem.readInt(u32, raw[at..][0..4], .little);
        std.mem.writeInt(u32, raw[at..][0..4], flags | (1 << 20), .little);
        count += 1;
    };
    if (count != 1) return error.ExpectedOneOwnPicture;
    const encoded = if (source.header.has(.compressed)) try @import("../../compression/raw_deflate.zig").encodeStored(a, raw, 32 * 1024 * 1024) else try a.dupe(u8, raw);
    defer a.free(encoded);
    return @import("../../cfb/stream_replace.zig").rebuildExact(a, &source.file, "/BodyText/Section0", encoded, .{ .max_output_bytes = 64 * 1024 * 1024 });
}
