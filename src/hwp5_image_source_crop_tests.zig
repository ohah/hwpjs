//! Prepared Native tests; source/AST checks are not a compiled or actual-save claim.
const std = @import("std");
const t = std.testing;
const a = t.allocator;
const png = @embedFile("testing/fixtures/image-source-crop/own-quadrants.png");
const jpeg = @embedFile("testing/fixtures/image-source-crop/own-quadrants.jpg");
const records = @import("hwp5/edit/image_insertion_records.zig");
const profile = @import("hwp5/edit/image_insertion_profile.zig");
const PixelSize = @import("image/picture_input.zig").PixelSize;
const display: @import("image/image_insertion.zig").Size = .{ .width = 7200, .height = 3600 };
fn assertPicture(raw: []const u8, version: @import("hwp5/version.zig").Version) !void {
    const picture = try @import("hwp5/body/shape_picture.zig").Picture.parse(raw, .interleaved, .with_instance78);
    try t.expectEqualDeep([4]i32{ 0, 0, 4800, 2400 }, picture.crop);
    try t.expectEqualDeep([2]i32{ 7200, 3600 }, .{ picture.points.get(2).?.x, picture.points.get(2).?.y });
    // Fixed saved offsets: display quad and source crop must not share a box.
    try t.expectEqual(@as(u32, 7200), std.mem.readInt(u32, raw[28..32], .little));
    try t.expectEqual(@as(u32, 3600), std.mem.readInt(u32, raw[32..36], .little));
    try t.expectEqual(@as(u32, 4800), std.mem.readInt(u32, raw[52..56], .little));
    try t.expectEqual(@as(u32, 2400), std.mem.readInt(u32, raw[56..60], .little));
    const layout = try profile.layout(version);
    const selected: ?@import("hwp5/body/picture_additional.zig").Layout = switch (layout) {
        .effects_only => null,
        .dimensions8 => .dimensions8,
        .with_alpha9 => .with_alpha9,
    };
    var reader: @import("binary/reader.zig").Reader = .{ .bytes = picture.extra };
    const tail = try @import("hwp5/body/picture_tail.zig").Tail.read(&reader, selected);
    try t.expectEqual(picture.extra.len, reader.offset);
    try t.expectEqual(@as(u32, 0), tail.effects.flags);
    if (layout == .effects_only) {
        try t.expectEqual(@as(usize, 82), raw.len);
        try t.expect(tail.properties == null);
    } else {
        try t.expectEqual(@as(u32, 4800), tail.properties.?.width);
        try t.expectEqual(@as(u32, 2400), tail.properties.?.height);
        try t.expectEqual(@as(?i8, if (layout == .with_alpha9) 0 else null), tail.properties.?.alpha);
        try t.expectEqual(@as(usize, if (layout == .with_alpha9) 91 else 90), raw.len);
    }
}
test "image source crop inspected own PNG JPEG dimensions remain independent from display" {
    for ([_][]const u8{ png, jpeg }) |bytes| {
        const raster = try @import("image/picture_input.zig").inspectRaster(bytes, 8 * 1024 * 1024);
        try t.expectEqualDeep(PixelSize{ .width = 64, .height = 32 }, raster.pixels);
        try t.expectEqualStrings((try @import("image/picture_input.zig").inspectImage(bytes, 8 * 1024 * 1024)).mime, raster.media.mime);
    }
}
test "image source crop explicit five version tails preserve display and consume exact raw" {
    for ([_]u32{ 0x05000300, 0x05000304, 0x05000500, 0x05010001, 0x05010100 }) |raw| {
        const value = try records.create(.{ .raw = raw }, display, .{ .width = 64, .height = 32 }, 1, 9);
        const common = try @import("hwp5/body/object_common.zig").parseControl(try @import("hwp5/body/control_header.zig").Header.parse(&value.control));
        try t.expectEqual(@as(u32, 7200), common.width);
        try t.expectEqual(@as(u32, 3600), common.height);
        try t.expectEqual(@as(u32, 9), common.instance_id);
        try assertPicture(value.picture[0..value.picture_len], .{ .raw = raw });
    }
}
test "image source crop signed source bounds and unknown versions never clamp or upgrade" {
    const max: u32 = std.math.maxInt(i32) / 75;
    const exact = try profile.sourceSize(.{ .width = max, .height = 1 });
    try t.expectEqual(max * 75, exact.width);
    try t.expectError(error.InvalidPictureInsertionSourceSize, profile.sourceSize(.{ .width = max + 1, .height = 1 }));
    try t.expectError(error.InvalidPictureInsertionSourceSize, profile.sourceSize(.{ .width = 0, .height = 1 }));
    for ([_]u32{ 0x05000107, 0x050002ff, 0x05000301, 0x05000302, 0x05000303, 0x05010000, 0x05010002 }) |raw| try t.expectError(error.UnsupportedPictureInsertionVersion, records.create(.{ .raw = raw }, display, .{ .width = 64, .height = 32 }, 1, 9));
}
fn checkSaved(bytes: []const u8, image: []const u8) !void {
    var source = try @import("hwp5/text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const section = try source.decodeSection(a, 0);
    defer a.free(section);
    var it = @import("hwp5/record.zig").Iterator.init(section, .{});
    var count: usize = 0;
    var text_count: usize = 0;
    while (try it.next()) |record| {
        if (record.tag == 67) {
            try t.expectEqual(@as(usize, 50), record.payload.len);
            try t.expectEqual(@as(u16, 2), std.mem.readInt(u16, record.payload[0..2], .little));
            try t.expectEqual(@as(u16, 2), std.mem.readInt(u16, record.payload[16..18], .little));
            try t.expectEqual(@as(u16, 11), std.mem.readInt(u16, record.payload[32..34], .little));
            try t.expectEqual(@as(u16, 13), std.mem.readInt(u16, record.payload[48..50], .little));
            text_count += 1;
        }
        if (record.tag == 85) {
            try assertPicture(record.payload, source.header.version());
            count += 1;
        }
    }
    try t.expectEqual(@as(usize, 1), count);
    try t.expectEqual(@as(usize, 1), text_count);
    const fresh = try @import("hwp5/edit/style_preservation.zig").Session.open(a, bytes);
    defer fresh.close();
    const resources = try fresh.binaryResource(a, 1, 8 * 1024 * 1024);
    defer a.free(resources);
    try t.expectEqualSlices(u8, image, resources);
}
fn savedCase(image: []const u8) !void {
    const input = try @import("new_document/hwp5.zig").create(a);
    defer a.free(input);
    const session = try @import("hwp5/edit/style_preservation.zig").Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    const history = try @import("hwp5/edit/history_v2.zig").History.create(a, session, .{});
    defer history.deinit();
    const raw = try session.copyText(a, 0, 0);
    defer a.free(raw);
    const request: @import("hwp5/edit/image_create_request.zig").Request = .{ .target = .{ .section = 0, .binding = try session.historyTicket(), .anchor = .{ .host = .{ .original_node = (try session.paragraph(0, 0)).source_node.? }, .unit = 16 } }, .expected_text_utf16le = raw, .box = .{ .width = display.width, .height = display.height }, .image = image };
    try t.expect(try history.applyBatch(session, &.{.{ .insert_image = request }}));
    try t.expectError(error.LayoutReflowRequired, session.save(a, .{}));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try checkSaved(saved.bytes, image);
    try t.expect(try history.undo(session));
    const undone = try session.save(a, .{});
    defer a.free(undone.bytes);
    try t.expectEqualSlices(u8, input, undone.bytes);
    try t.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try t.expectEqualSlices(u8, saved.bytes, redone.bytes);
    try checkSaved(redone.bytes, image);
}
test "image source crop own PNG Session History saved raw reopen undo redo and strict refusal" {
    try savedCase(png);
}
test "image source crop own JPEG Session History saved raw reopen undo redo and strict refusal" {
    try savedCase(jpeg);
}
test "image source crop standalone file transform uses same inspected raster extent" {
    const input = try @import("new_document/hwp5.zig").create(a);
    defer a.free(input);
    const session = try @import("hwp5/edit/style_preservation.zig").Session.open(a, input);
    defer session.close();
    const raw = try session.copyText(a, 0, 0);
    defer a.free(raw);
    const expected = try @import("image/image_insertion.zig").utf8FromUtf16(a, raw);
    defer a.free(expected);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(input, &digest, .{});
    const request: @import("image/image_insertion.zig").Request = .{ .expected_source_sha256 = digest, .target = .{ .section = 0, .paragraph = 0, .unit = 16 }, .expected_text = expected, .width = display.width, .height = display.height };
    for ([_][]const u8{ png, jpeg }) |image| {
        var result = try @import("hwp5/edit/image_insertion_file.zig").prepare(a, input, image, request);
        defer result.deinit(a);
        try checkSaved(result.bytes, image);
    }
}
