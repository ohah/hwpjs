//! Source candidates: actual Native execution remains separately coordinated.
const std = @import("std");
const t = std.testing;
const a = t.allocator;
const Editor = @import("hwpx/editor_session.zig");
const History = @import("hwpx/editor_history.zig").History;
const Request = @import("hwpx/image_insert.zig").Request;
const Size = @import("image/image_insertion.zig").Size;
const png = @embedFile("testing/fixtures/image-source-crop/own-quadrants.png");
const jpeg = @embedFile("testing/fixtures/image-source-crop/own-quadrants.jpg");
fn sha(bytes: []const u8) [32]u8 {
    var out: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &out, .{});
    return out;
}
fn request(s: *Editor.Session, h: *History, image: []const u8, size: Size) !Request {
    const before = try s.save();
    defer a.free(before);
    const binding: @import("hwpx/inline_object_placement.zig").Binding = .{ .session = "s1", .revision = h.revision(), .serial = "1" };
    const observation = try @import("hwpx/inline_object_placement.zig").current(s, .{ .section = 0, .paragraph = 1 }, binding);
    return .{ .expected_source_sha256 = sha(before), .target = .{ .section = 0, .paragraph = 1, .owner = observation.owner, .unit = @intCast(try std.unicode.calcUtf16LeLen(observation.text)), .expected_text = observation.text }, .width = size.width, .height = size.height, .image = image };
}
fn apply(h: *History, s: *Editor.Session, r: *const Request) !bool {
    return h.apply(s, .{ .kind = .image_insert, .section = 0, .paragraph = 1, .start = r.target.unit, .deleted = 0, .inserted = "", .image_insert = r });
}
fn contains(raw: []const u8, needle: []const u8) !void {
    try t.expect(std.mem.indexOf(u8, raw, needle) != null);
}
fn savedWitness(bytes: []const u8, image: []const u8, size: Size) !void {
    var package = try @import("hwpx/package.zig").inspectDocument(a, bytes, .{});
    defer package.deinit(a);
    var tree = try package.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    var inventory = try @import("hwpx/picture_image_links.zig").inspectSections(a, package.manifest, &.{tree}, .{});
    defer inventory.deinit(a);
    try t.expectEqual(@as(usize, 1), inventory.sites.len);
    const site = inventory.sites[0];
    const crop = try @import("hwpx/picture_crop_values.zig").read(a, &tree, site.picture_element_index);
    try t.expectEqualDeep([4]?i64{ 0, 4800, 0, 2400 }, crop.clip);
    try t.expectEqualDeep([2]?u32{ null, null }, crop.image_dimensions);
    const dim = try @import("hwpx/picture_dimension_values.zig").read(a, &tree, site.picture_element_index);
    const box: [2]?u32 = .{ size.width, size.height };
    try t.expectEqualDeep(box, dim.display);
    try t.expectEqualDeep(box, dim.original);
    try t.expectEqualDeep(box, dim.current);
    const points = try @import("hwpx/picture_rectangle_values.zig").read(a, &tree, site.picture_element_index);
    try t.expectEqualDeep([2]?i64{ size.width, size.height }, points.points[2]);
    // Raw saved XML witnesses do not derive expected values from the writer or crop reader.
    try contains(tree.source, "<hp:imgClip left=\"0\" right=\"4800\" top=\"0\" bottom=\"2400\"/>");
    try t.expect(std.mem.indexOf(u8, tree.source, "<hp:imgDim") == null);
    const original_size = try std.fmt.allocPrint(a, "<hp:orgSz width=\"{d}\" height=\"{d}\"/>", .{ size.width, size.height });
    defer a.free(original_size);
    try contains(tree.source, original_size);
    const path = try std.fmt.allocPrint(a, "BinData/hwpjs-insertion-0.{s}", .{if (image[0] == 0x89) @as([]const u8, "png") else "jpg"});
    defer a.free(path);
    const entry = package.archive.find(path) orelse return error.MissingInsertedImage;
    const raw = try package.archive.decode(entry, 8 * 1024 * 1024);
    defer a.free(raw);
    try t.expectEqualSlices(u8, image, raw);
    var fresh = try Editor.open(a, bytes, .{});
    defer fresh.deinit();
    const fresh_bytes = try fresh.save();
    defer a.free(fresh_bytes);
    try t.expectEqualSlices(u8, bytes, fresh_bytes);
}
fn unchangedEntries(before: []const u8, after: []const u8) !void {
    var old = try @import("hwpx/package.zig").inspectDocument(a, before, .{});
    defer old.deinit(a);
    var new = try @import("hwpx/package.zig").inspectDocument(a, after, .{});
    defer new.deinit(a);
    // The package spine includes header before section0; resolve the typed section.
    var selected_section = try old.readSectionTree(a, 0, .{});
    defer selected_section.deinit(a);
    const section_path = old.manifest.items[selected_section.item_index].href;
    for (old.archive.entries) |entry| {
        if (std.mem.eql(u8, entry.name, section_path) or std.mem.eql(u8, entry.name, old.container.path)) continue;
        const next = new.archive.find(entry.name) orelse return error.MissingPreservedEntry;
        const left = try old.archive.decode(entry, 32 * 1024 * 1024);
        defer a.free(left);
        const right = try new.archive.decode(next, 32 * 1024 * 1024);
        defer a.free(right);
        try t.expectEqualSlices(u8, left, right);
    }
}
fn roundtrip(image: []const u8, size: Size) !void {
    const input = try @import("new_document/hwpx.zig").create(a);
    defer a.free(input);
    var s = try Editor.open(a, input, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try History.initV2(&s, .{});
    defer h.deinit();
    const r = try request(&s, &h, image, size);
    defer a.free(r.target.expected_text);
    try t.expect(try apply(&h, &s, &r));
    const saved = try s.save();
    defer a.free(saved);
    try savedWitness(saved, image, size);
    try unchangedEntries(input, saved);
    try t.expect(try h.undo(&s));
    const undone = try s.save();
    defer a.free(undone);
    try t.expectEqualSlices(u8, input, undone);
    const bad = try request(&s, &h, "bad", size);
    defer a.free(bad.target.expected_text);
    const revision = h.revision();
    try t.expectError(error.UnsupportedReplacementImageFormat, apply(&h, &s, &bad));
    try t.expectEqual(revision, h.revision());
    try t.expect(try h.redo(&s));
    const redone = try s.save();
    defer a.free(redone);
    try t.expectEqualSlices(u8, saved, redone);
    try savedWitness(redone, image, size);
}
test "HX image source crop PNG display larger than bitmap saved raw fresh reopen undo redo" {
    try roundtrip(png, .{ .width = 7200, .height = 3600 });
}
test "HX image source crop PNG display smaller than bitmap saved raw fresh reopen undo redo" {
    try roundtrip(png, .{ .width = 2400, .height = 1200 });
}
test "HX image source crop JPEG display larger than bitmap saved raw fresh reopen undo redo" {
    try roundtrip(jpeg, .{ .width = 7200, .height = 3600 });
}
test "HX image source crop JPEG display smaller than bitmap saved raw fresh reopen undo redo" {
    try roundtrip(jpeg, .{ .width = 2400, .height = 1200 });
}
test "HX image source crop standalone file writer shares inspected raster source extent" {
    const blank = try @import("new_document/hwpx.zig").create(a);
    defer a.free(blank);
    var seed = try Editor.open(a, blank, .{});
    defer seed.deinit();
    // Normal edit/split keeps the structural prefix in paragraph1 and prepares
    // an independent plain second paragraph for the standalone file contract.
    try t.expect(try seed.spliceAnchored(0, 1, 0, 0, "A"));
    try t.expect(try seed.splitParagraphAnchored(0, 1, 0, 0));
    const input = try seed.save();
    defer a.free(input);
    for ([_][]const u8{ png, jpeg }) |image| {
        const size: Size = .{ .width = 7200, .height = 3600 };
        var output = try @import("hwpx/image_insertion_file.zig").prepare(a, input, image, .{ .expected_source_sha256 = sha(input), .target = .{ .section = 0, .paragraph = 2, .unit = 1 }, .expected_text = "A", .width = size.width, .height = size.height });
        defer output.deinit(a);
        try savedWitness(output.bytes, image, size);
        try unchangedEntries(input, output.bytes);
    }
}
test "HX image source crop rejects zero and signed overflow without clamping source or display" {
    const writer = @import("hwpx/image_insertion_xml.zig");
    const max = std.math.maxInt(i32) / 75;
    try t.expectError(error.InvalidPictureInsertionSourceSize, writer.sourceExtent(.{ .width = 0, .height = 1 }));
    try t.expectError(error.InvalidPictureInsertionSourceSize, writer.sourceExtent(.{ .width = 1, .height = 0 }));
    try t.expectError(error.InvalidPictureInsertionSourceSize, writer.sourceExtent(.{ .width = max + 1, .height = 1 }));
    try t.expectError(error.InvalidPictureInsertionSourceSize, writer.sourceExtent(.{ .width = 1, .height = max + 1 }));
    try t.expectEqual(@as(u32, max * 75), (try writer.sourceExtent(.{ .width = max, .height = 1 })).width);
}
