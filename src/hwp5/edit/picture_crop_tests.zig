//! Prepared focused Native contracts. No execution result is implied by source preparation.
const std = @import("std");
const t = std.testing;
const a = t.allocator;
const crop = @import("picture_crop.zig");
const fixture = @import("picture_crop_fixture.zig");
const Session = @import("style_preservation.zig").Session;
const History = @import("editor_history.zig").History;
const wanted: crop.Rect = .{ .left = 75, .top = 150, .right = 4725, .bottom = 2250 };

test "H5 existing crop bounded source coordinates never clamp or mix display units" {
    const extent: crop.Extent = .{ .width = 4800, .height = 2400, .basis = .raster_96dpi };
    try crop.validateRect(.{ .left = 0, .top = 0, .right = 4800, .bottom = 2400 }, extent);
    try crop.validateRect(.{ .left = 4799, .top = 2399, .right = 4800, .bottom = 2400 }, extent);
    for ([_]crop.Rect{ .{ .left = -1, .top = 0, .right = 4800, .bottom = 2400 }, .{ .left = 0, .top = 0, .right = 7200, .bottom = 3600 }, .{ .left = 1, .top = 0, .right = 1, .bottom = 1 }, .{ .left = 0, .top = 0, .right = 1, .bottom = 0 } }) |rect| try t.expectError(error.InvalidPictureCropRectangle, crop.validateRect(rect, extent));
}
test "H5 existing crop explicit extent and absent raster basis remain distinct without tail guesses" {
    for ([_]u32{ 0x05000300, 0x05000304, 0x05000500 }) |version| for ([_][]const u8{ fixture.png, fixture.jpeg }) |image| {
        var records = try @import("image_insertion_records.zig").create(.{ .raw = version }, .{ .width = 7200, .height = 3600 }, .{ .width = 64, .height = 32 }, 1, 9);
        const extent = try crop.sourceExtent(records.picture[0..records.picture_len], .{ .raw = version }, image);
        try t.expectEqual(@as(u32, 4800), extent.width);
        try t.expectEqual(@as(u32, 2400), extent.height);
        try t.expectEqual(if (version == 0x05000300) crop.Basis.raster_96dpi else crop.Basis.original_dimensions, extent.basis);
        if (version != 0x05000300) {
            std.mem.writeInt(u32, records.picture[82..86], 9600, .little);
            try t.expectEqual(@as(u32, 9600), (try crop.sourceExtent(records.picture[0..records.picture_len], .{ .raw = version }, image)).width);
            std.mem.writeInt(u32, records.picture[82..86], 0, .little);
            try t.expectError(error.InvalidPictureCropExtent, crop.sourceExtent(records.picture[0..records.picture_len], .{ .raw = version }, image));
        }
    };
    const records = try @import("image_insertion_records.zig").create(.{ .raw = 0x05000304 }, .{ .width = 7200, .height = 3600 }, .{ .width = 64, .height = 32 }, 1, 9);
    try t.expectError(error.UnexpectedEnd, crop.sourceExtent(records.picture[0..88], .{ .raw = 0x05000304 }, fixture.png));
    try t.expectError(error.UnsupportedPictureCropVersion, crop.sourceExtent(records.picture[0..records.picture_len], .{ .raw = 0x05000301 }, fixture.png));
}
fn roundtrip(image: []const u8) !void {
    const input = try fixture.make(a, image);
    defer a.free(input);
    try roundtripInput(input, image);
}
fn roundtripInput(input: []const u8, image: []const u8) !void {
    const s = try Session.open(a, input);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    const selected = try fixture.selector(a, s);
    const before = try s.pictureCrop(selected);
    try t.expectEqualDeep(crop.Rect{ .left = 0, .top = 0, .right = 4800, .bottom = 2400 }, before.rect);
    try t.expect(try h.apply(s, .{ .set_picture_crop = .{ .before = before, .rect = wanted } }));
    try t.expectEqual(@as(u32, 1), h.revision());
    try t.expectError(error.LayoutReflowRequired, s.save(a, .{}));
    const saved = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try fixture.assertRaw(a, input, saved.bytes, wanted);
    const pixels = try s.binaryResource(a, before.target.resource_ordinal, 8 * 1024 * 1024);
    defer a.free(pixels);
    try t.expectEqualSlices(u8, image, pixels);
    const fresh = try Session.open(a, saved.bytes);
    defer fresh.close();
    fresh.enableHistoryDelta();
    var fresh_h = try History.initV2(a, fresh, .{});
    defer fresh_h.deinit();
    const reopened = try fresh.pictureCrop(try fixture.selector(a, fresh));
    try t.expectEqualDeep(wanted, reopened.rect);
    try t.expectEqualDeep(before.extent, reopened.extent);
    try t.expect(try h.undo(s));
    const undone = try s.save(a, .{});
    defer a.free(undone.bytes);
    try t.expectEqualSlices(u8, input, undone.bytes);
    try t.expect(try h.redo(s));
    const redone = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try t.expectEqualSlices(u8, saved.bytes, redone.bytes);
}
test "H5 existing crop own PNG exact raw sixteen bytes resource display history save reopen" {
    try roundtrip(fixture.png);
}
test "H5 existing crop own JPEG exact raw sixteen bytes resource display history save reopen" {
    try roundtrip(fixture.jpeg);
}

test "H5 existing crop stale physical source resource foreign and replay preserve prior redo" {
    const input = try fixture.make(a, fixture.png);
    defer a.free(input);
    const s = try Session.open(a, input);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    const selected = try fixture.selector(a, s);
    const original = try s.pictureCrop(selected);
    for (0..3) |mode| {
        var forged = original;
        if (mode == 0) forged.target.source_sha256[0] ^= 1 else if (mode == 1) forged.target.resource_sha256[0] ^= 1 else forged.target.anchor_unit += 1;
        try t.expectError(error.StalePictureCropTarget, h.apply(s, .{ .set_picture_crop = .{ .before = forged, .rect = wanted } }));
    }
    try t.expect(try h.apply(s, .{ .set_picture_crop = .{ .before = original, .rect = wanted } }));
    try t.expectError(error.StaleMutationEpoch, h.apply(s, .{ .set_picture_crop = .{ .before = original, .rect = wanted } }));
    try t.expect(try h.undo(s));
    const now = try s.pictureCrop(selected);
    const other = try Session.open(a, input);
    defer other.close();
    other.enableHistoryDelta();
    var other_h = try History.initV2(a, other, .{});
    defer other_h.deinit();
    const foreign = try other.pictureCrop(selected);
    try t.expectEqualSlices(u8, &now.target.source_sha256, &foreign.target.source_sha256);
    try t.expectError(error.StaleMutationEpoch, other_h.apply(other, .{ .set_picture_crop = .{ .before = now, .rect = wanted } }));
    const stats = h.stats();
    try t.expectError(error.InvalidPictureCropRectangle, h.apply(s, .{ .set_picture_crop = .{ .before = now, .rect = .{ .left = 0, .top = 0, .right = 4801, .bottom = 2400 } } }));
    try t.expect(!try h.apply(s, .{ .set_picture_crop = .{ .before = now, .rect = now.rect } }));
    try t.expectEqual(stats.redoCount, h.stats().redoCount);
    const unchanged = try s.save(a, .{});
    defer a.free(unchanged.bytes);
    try t.expectEqualSlices(u8, input, unchanged.bytes);
    try t.expect(try h.redo(s));
}
test "H5 existing crop pending display size intent survives crop without rebaking geometry" {
    const input = try fixture.make(a, fixture.png);
    defer a.free(input);
    const s = try Session.open(a, input);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    const selected = try fixture.selector(a, s);
    try t.expect(try h.apply(s, .{ .set_picture_current_size = .{ .section = 0, .picture_node = selected.picture_node, .width = 8000, .height = 4000 } }));
    const sized = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(sized.bytes);
    const before = try s.pictureCrop(selected);
    try t.expect(try h.apply(s, .{ .set_picture_crop = .{ .before = before, .rect = wanted } }));
    const saved = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try fixture.assertRaw(a, sized.bytes, saved.bytes, wanted);
    try t.expect(try h.undo(s));
    const undone = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(undone.bytes);
    try t.expectEqualSlices(u8, sized.bytes, undone.bytes);
}
test "H5 existing crop legacy direct dispatch and protected size refuse before mutation" {
    const input = try fixture.make(a, fixture.png);
    defer a.free(input);
    const s = try Session.open(a, input);
    defer s.close();
    s.enableHistoryDelta();
    const before = try s.pictureCrop(try fixture.selector(a, s));
    const command: @import("style_preservation.zig").Command = .{ .set_picture_crop = .{ .before = before, .rect = wanted } };
    try t.expectError(error.HistoryProtocol2Required, s.apply(command));
    var legacy = try History.init(a, s, 4, 8 * 1024 * 1024);
    defer legacy.deinit();
    try t.expectError(error.HistoryProtocol2Required, legacy.apply(s, command));
    const protected = try fixture.sizeProtected(a, input);
    defer a.free(protected);
    const locked = try Session.open(a, protected);
    defer locked.close();
    locked.enableHistoryDelta();
    try t.expectError(error.UnsupportedPictureCropGeometry, locked.pictureCrop(try fixture.selector(a, locked)));
    const unchanged = try locked.save(a, .{});
    defer a.free(unchanged.bytes);
    try t.expectEqualSlices(u8, protected, unchanged.bytes);
}
test "H5 existing crop noop and stale precede exhausted revision epoch counters" {
    const input = try fixture.make(a, fixture.png);
    defer a.free(input);
    const s = try Session.open(a, input);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    const before = try s.pictureCrop(try fixture.selector(a, s));
    for ([_]bool{ false, true }) |exhaust_epoch| {
        const next_revision = h.owned.?.stack.next_revision;
        const epoch = h.owned.?.stack.epoch;
        defer {
            h.owned.?.stack.next_revision = next_revision;
            h.owned.?.stack.epoch = epoch;
        }
        if (exhaust_epoch) h.owned.?.stack.epoch = std.math.maxInt(u64) else h.owned.?.stack.next_revision = std.math.maxInt(u32);
        try t.expect(!try h.apply(s, .{ .set_picture_crop = .{ .before = before, .rect = before.rect } }));
        var stale = before;
        stale.target.ticket.epoch += 1;
        try t.expectError(error.StaleMutationEpoch, h.apply(s, .{ .set_picture_crop = .{ .before = stale, .rect = before.rect } }));
        try t.expectError(error.HistoryRevisionExhausted, h.apply(s, .{ .set_picture_crop = .{ .before = before, .rect = wanted } }));
    }
}

test "H5 existing crop approved picture resize paired fixture strict raw history roundtrip" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "apps/docs/docs/public/editor/fixtures/picture-resize.hwp", a, .limited(8 * 1024 * 1024));
    defer a.free(input);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(input, &digest, .{});
    try t.expectEqualStrings("6b2010227e9d6cd41c242e0a29281eddb58f8f618c5df137c4ca3d518665dda2", &std.fmt.bytesToHex(digest, .lower));
    const s = try Session.open(a, input);
    defer s.close();
    const rows = try s.pictureSources(a, 0, .base73);
    defer a.free(rows);
    try t.expectEqual(@as(usize, 1), rows.len);
    const resource = try s.binaryResource(a, rows[0].bin_data_id, 8 * 1024 * 1024);
    defer a.free(resource);
    try roundtripInput(input, resource);
}
