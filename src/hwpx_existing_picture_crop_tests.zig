//! Prepared focused tests only; execution requires a separate coordinated grant.
const std = @import("std");
const t = std.testing;
const a = t.allocator;
const Editor = @import("hwpx/editor_session.zig");
const History = @import("hwpx/editor_history.zig").History;
const crop = @import("hwpx/picture_crop_edit.zig");
const contract = @import("model/picture_replacement.zig");
const png = @embedFile("testing/fixtures/image-source-crop/own-quadrants.png");
const jpeg = @embedFile("testing/fixtures/image-source-crop/own-quadrants.jpg");
fn hxBaseline() ![]u8 {
    const blank = try @import("new_document/hwpx.zig").create(a);
    defer a.free(blank);
    var s = try @import("hwpx/editor_session.zig").open(a, blank, .{});
    defer s.deinit();
    try t.expect(try s.spliceAnchored(0, 1, 0, 0, "A"));
    try t.expect(try s.splitParagraphAnchored(0, 1, 0, 0));
    const input = try s.save();
    defer a.free(input);
    const out = try @import("hwpx/image_insertion_file.zig").prepare(a, input, png, .{ .expected_source_sha256 = contract.hash(input), .target = .{ .section = 0, .paragraph = 2, .unit = 1 }, .expected_text = "A", .width = 7200, .height = 3600 });
    a.free(out.resource_path);
    return out.bytes;
}

fn picture(s: *Editor.Session) !u32 {
    const sites = try @import("hwpx/picture_display_sites.zig").read(a, s, 0);
    defer a.free(sites);
    try t.expectEqual(@as(usize, 1), sites.len);
    return @intCast(sites[0].picture_node);
}
fn command(request: *const crop.Request) @import("hwpx/editor_history.zig").Command {
    return .{ .kind = .picture_crop, .section = request.before.owner.section, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .picture_crop = request };
}
const clipped: crop.Rect = .{ .left = 750, .top = 375, .right = 4050, .bottom = 2025 };
fn unchangedEntries(before: []const u8, after: []const u8) !void {
    var old = try @import("hwpx/package.zig").inspectDocument(a, before, .{});
    defer old.deinit(a);
    var new = try @import("hwpx/package.zig").inspectDocument(a, after, .{});
    defer new.deinit(a);
    try t.expectEqual(old.archive.entries.len, new.archive.entries.len);
    var tree = try old.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    const path = old.manifest.items[tree.item_index].href;
    for (old.archive.entries) |entry| {
        if (std.mem.eql(u8, entry.name, path)) continue;
        const next = new.archive.find(entry.name) orelse return error.MissingPreservedEntry;
        const x = try old.archive.decode(entry, 32 * 1024 * 1024);
        defer a.free(x);
        const y = try new.archive.decode(next, 32 * 1024 * 1024);
        defer a.free(y);
        try t.expectEqualSlices(u8, x, y);
    }
}
test "HX existing crop qualifies raw basis without guessing from clip or display" {
    const raw: @import("hwpx/picture_crop_values.zig").Values = .{ .clip = .{ -10, 999999, 0, 1 } };
    try t.expectEqualDeep(crop.Bounds{ .width = 4800, .height = 2400, .basis = .absent_75_policy }, try crop.qualify(raw, .{ .width = 64, .height = 32 }));
    var explicit = raw;
    explicit.image_dimensions = .{ 12800, 3200 };
    try t.expectEqualDeep(crop.Bounds{ .width = 12800, .height = 3200, .basis = .explicit_pair }, try crop.qualify(explicit, .{ .width = 64, .height = 32 }));
    for ([_][2]?u32{ .{ 0, 0 }, .{ 1, null }, .{ null, 2 }, .{ 0, 2 } }) |pair| {
        explicit.image_dimensions = pair;
        try t.expectError(error.UnsupportedPictureCropReference, crop.qualify(explicit, .{ .width = 64, .height = 32 }));
    }
    try t.expectError(error.MissingPictureCropMediaGeometry, crop.qualify(raw, .{ .width = 0, .height = 32 }));
    try t.expectError(error.Overflow, crop.qualify(raw, .{ .width = std.math.maxInt(u32), .height = 32 }));
}
test "HX existing crop exact bounds plus one and empty negative rectangles refuse" {
    const bounds: crop.Bounds = .{ .width = 4800, .height = 2400, .basis = .absent_75_policy };
    try crop.validateRect(.{ .left = 0, .top = 0, .right = 4800, .bottom = 2400 }, bounds);
    for ([_]crop.Rect{
        .{ .left = 0, .top = 0, .right = 4801, .bottom = 2400 },
        .{ .left = 0, .top = 0, .right = 4800, .bottom = 2401 },
        .{ .left = -1, .top = 0, .right = 4800, .bottom = 2400 },
        .{ .left = 0, .top = 0, .right = 0, .bottom = 2400 },
    }) |value| try t.expectError(error.InvalidPictureCropRectangle, crop.validateRect(value, bounds));
}
const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:pic id='1'><p:imgClip left='-1' right = \"4800\" top='0' bottom='2400' extra='keep'/><!--keep--><p:sz width='7200' height='3600'/></p:pic></s:sec>";
fn lexical(a2: std.mem.Allocator) !void {
    var tree = try @import("hwpx/section_tree.zig").parse(a2, xml, 0, 0, .{});
    defer tree.deinit(a2);
    const raw = try @import("hwpx/picture_crop_values.zig").read(a2, &tree, 1);
    const bytes = try crop.writeTree(a2, &tree, 1, raw, clipped, .{ .width = 4800, .height = 2400, .basis = .absent_75_policy }, 4096);
    defer a2.free(bytes);
    const expected = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:pic id='1'><p:imgClip left='750' right = \"4050\" top='375' bottom='2025' extra='keep'/><!--keep--><p:sz width='7200' height='3600'/></p:pic></s:sec>";
    try t.expectEqualStrings(expected, bytes);
    try t.expectEqualStrings(xml, tree.source);
}
test "HX existing crop source writer preserves all unrelated lexemes and cleanup" {
    try lexical(a);
    // Allocation sweep is prepared, not part of the initial regular cohort.
}
test "HX existing crop PNG JPEG single history saved reopen exact undo redo" {
    const seed = try hxBaseline();
    defer a.free(seed);
    for ([_][]const u8{ png, jpeg }) |media| {
        var s = try Editor.open(a, seed, .{});
        defer s.deinit();
        s.history_delta_managed = true;
        var h = try History.initV2(&s, .{});
        defer h.deinit();
        // JPEG is installed with the existing transaction before crop capture.
        if (media[0] == 0xff) {
            var owner = try @import("hwpx/picture_replacement_current.zig").observe(a, &s, 0, try picture(&s), h.revision(), .{ .session = "setup", .serial = "0" });
            defer owner.deinit(a);
            const replacement: contract.Request = .{ .owner = owner, .image = jpeg };
            try t.expect(try h.apply(&s, .{ .kind = .picture_replace, .section = 0, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .picture_replace = &replacement }));
        }
        const before = try s.save();
        defer a.free(before);
        const node = try picture(&s);
        const geometry = try @import("hwpx/picture_dimension_values.zig").read(a, &s.sections[0].tree, node);
        var observed = try h.pictureCrop(&s, a, 0, node);
        defer observed.deinit(a);
        const r: crop.Request = .{ .before = observed, .value = clipped };
        const revision = h.revision();
        try t.expect(try h.apply(&s, command(&r)));
        try t.expectEqual(revision + 1, h.revision());
        const after = try s.save();
        defer a.free(after);
        try unchangedEntries(before, after);
        const after_node = try picture(&s);
        try t.expectEqualDeep(geometry, try @import("hwpx/picture_dimension_values.zig").read(a, &s.sections[0].tree, after_node));
        const raw = try @import("hwpx/picture_crop_values.zig").read(a, &s.sections[0].tree, after_node);
        try t.expectEqualDeep([4]?i64{ 750, 4050, 375, 2025 }, raw.clip);
        try t.expectEqualDeep([2]?u32{ null, null }, raw.image_dimensions);
        const bytes = try @import("hwpx/picture_source_bytes.zig").read(a, &s, 0, after_node, contract.max_image_bytes);
        defer a.free(bytes);
        try t.expectEqualSlices(u8, media, bytes);
        var reopen = try Editor.open(a, after, .{});
        defer reopen.deinit();
        const saved = try reopen.save();
        defer a.free(saved);
        try t.expectEqualSlices(u8, after, saved);
        try t.expectError(error.StalePictureCrop, h.apply(&s, command(&r)));
        try t.expect(try h.undo(&s));
        const undone = try s.save();
        defer a.free(undone);
        try t.expectEqualSlices(u8, before, undone);
        try t.expect(try h.redo(&s));
        const redone = try s.save();
        defer a.free(redone);
        try t.expectEqualSlices(u8, after, redone);
    }
}
test "HX existing crop no op preserves prior redo and cross history owner refuses" {
    const seed = try hxBaseline();
    defer a.free(seed);
    var s = try Editor.open(a, seed, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try History.initV2(&s, .{});
    defer h.deinit();
    var first = try h.pictureCrop(&s, a, 0, try picture(&s));
    defer first.deinit(a);
    const r: crop.Request = .{ .before = first, .value = clipped };
    try t.expect(try h.apply(&s, command(&r)));
    try t.expect(try h.undo(&s));
    var fresh = try h.pictureCrop(&s, a, 0, try picture(&s));
    defer fresh.deinit(a);
    const noop: crop.Request = .{ .before = fresh, .value = .{ .left = 0, .top = 0, .right = 4800, .bottom = 2400 } };
    try t.expect(!try h.apply(&s, command(&noop)));
    try t.expectError(error.StalePictureCrop, h.apply(&s, command(&r)));
    try t.expect(try h.redo(&s));
    var other = try Editor.open(a, seed, .{});
    defer other.deinit();
    other.history_delta_managed = true;
    var h2 = try History.initV2(&other, .{});
    defer h2.deinit();
    try t.expectError(error.StalePictureCrop, h2.apply(&other, command(&noop)));
}
test "HX existing crop invalid command range preserves saved bytes" {
    const seed = try hxBaseline();
    defer a.free(seed);
    var s = try Editor.open(a, seed, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try History.initV2(&s, .{});
    defer h.deinit();
    var observed = try h.pictureCrop(&s, a, 0, try picture(&s));
    defer observed.deinit(a);
    const r: crop.Request = .{ .before = observed, .value = .{ .left = 0, .top = 0, .right = 4801, .bottom = 2400 } };
    try t.expectError(error.InvalidPictureCropRectangle, h.apply(&s, command(&r)));
    var bad = command(&r);
    bad.inserted = "x";
    try t.expectError(error.InvalidPictureCropCommand, h.apply(&s, bad));
    const after = try s.save();
    defer a.free(after);
    try t.expectEqualSlices(u8, seed, after);
    try t.expectEqual(@as(u32, 0), h.revision());
}

// Patch only a fresh own synthetic package, never the live Session or a corpus.
fn patchSeed(input: []const u8, needle: []const u8, replacement: []const u8) ![]u8 {
    var document = try @import("hwpx/package.zig").inspectDocument(a, input, .{});
    defer document.deinit(a);
    var tree = try document.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    const at = std.mem.indexOf(u8, tree.source, needle) orelse return error.MissingSyntheticNeedle;
    const xml2 = try std.mem.concat(a, u8, &.{ tree.source[0..at], replacement, tree.source[at + needle.len ..] });
    defer a.free(xml2);
    const path = document.manifest.items[tree.item_index].href;
    var index: ?usize = null;
    for (document.archive.entries, 0..) |entry, i| if (std.mem.eql(u8, entry.name, path)) {
        index = i;
    };
    return @import("zip/replace_writer.zig").write(a, input, &.{.{ .entry_index = index.?, .bytes = xml2 }}, .{});
}
test "HX existing crop explicit pair preserved and empty partial zero bases refuse" {
    const input = try hxBaseline();
    defer a.free(input);
    for ([_][]const u8{ "<hp:imgDim dimwidth='12800' dimheight='6400'/>", "<hp:imgDim/>", "<hp:imgDim dimwidth='1'/>", "<hp:imgDim dimwidth='0' dimheight='0'/>" }, 0..) |dim, index| {
        const added = try std.mem.concat(a, u8, &.{ dim, "<hp:inMargin" });
        defer a.free(added);
        const bytes = try patchSeed(input, "<hp:inMargin", added);
        defer a.free(bytes);
        var s = try Editor.open(a, bytes, .{});
        defer s.deinit();
        s.history_delta_managed = true;
        var h = try History.initV2(&s, .{});
        defer h.deinit();
        if (index == 0) {
            var observed = try h.pictureCrop(&s, a, 0, try picture(&s));
            defer observed.deinit(a);
            try t.expectEqualDeep(crop.Bounds{ .width = 12800, .height = 6400, .basis = .explicit_pair }, observed.bounds);
            const r: crop.Request = .{ .before = observed, .value = .{ .left = 3200, .top = 1600, .right = 9600, .bottom = 4800 } };
            try t.expect(try h.apply(&s, command(&r)));
            const raw = try @import("hwpx/picture_crop_values.zig").read(a, &s.sections[0].tree, try picture(&s));
            try t.expectEqualDeep([2]?u32{ 12800, 6400 }, raw.image_dimensions);
            try t.expect(std.mem.indexOf(u8, s.sections[0].tree.source, dim) != null);
        } else try t.expectError(error.UnsupportedPictureCropReference, h.pictureCrop(&s, a, 0, try picture(&s)));
    }
}
test "HX existing crop lock and unsupported resource refuse without state mutation" {
    const input = try hxBaseline();
    defer a.free(input);
    const locked = try patchSeed(input, "lock=\"0\"", "lock=\"1\"");
    defer a.free(locked);
    var s = try Editor.open(a, locked, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try History.initV2(&s, .{});
    defer h.deinit();
    try t.expectError(error.PictureReplacementReadOnly, h.pictureCrop(&s, a, 0, try picture(&s)));
    const saved = try s.save();
    defer a.free(saved);
    try t.expectEqualSlices(u8, locked, saved);
    try t.expectError(error.UnsupportedReplacementImageFormat, crop.mediaGeometry("GIF89a"));
}
test "HX existing crop immediately inserted current resource and pending dimensions survive" {
    const blank = try @import("new_document/hwpx.zig").create(a);
    defer a.free(blank);
    var s = try Editor.open(a, blank, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try History.initV2(&s, .{});
    defer h.deinit();
    const before = try s.save();
    defer a.free(before);
    const binding: @import("hwpx/inline_object_placement.zig").Binding = .{ .session = "s1", .revision = h.revision(), .serial = "1" };
    const location = try @import("hwpx/inline_object_placement.zig").current(&s, .{ .section = 0, .paragraph = 1 }, binding);
    defer a.free(location.text);
    const insertion: @import("hwpx/image_insert.zig").Request = .{ .expected_source_sha256 = contract.hash(before), .target = .{ .section = 0, .paragraph = 1, .owner = location.owner, .unit = @intCast(try std.unicode.calcUtf16LeLen(location.text)), .expected_text = location.text }, .width = 7200, .height = 3600, .image = png };
    try t.expect(try h.apply(&s, .{ .kind = .image_insert, .section = 0, .paragraph = 1, .start = insertion.target.unit, .deleted = 0, .inserted = "", .image_insert = &insertion }));
    const node = try picture(&s);
    try t.expect(try h.apply(&s, .{ .kind = .picture_dimensions, .section = 0, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .picture_node = node, .picture_dimensions = .{ .display = .{ 2400, 1200 } } }));
    const prior = try s.save();
    defer a.free(prior);
    var observed = try h.pictureCrop(&s, a, 0, node);
    defer observed.deinit(a);
    const r: crop.Request = .{ .before = observed, .value = clipped };
    try t.expect(try h.apply(&s, command(&r)));
    const dims = try @import("hwpx/picture_dimension_values.zig").read(a, &s.sections[0].tree, try picture(&s));
    try t.expectEqualDeep([2]?u32{ 2400, 1200 }, dims.display);
    const saved = try s.save();
    defer a.free(saved);
    try unchangedEntries(prior, saved);
    try t.expect(try h.undo(&s));
    const undone = try s.save();
    defer a.free(undone);
    try t.expectEqualSlices(u8, prior, undone);
}

test "HX existing crop field owned picture refuses before mutation" {
    const input = try hxBaseline();
    defer a.free(input);
    const begin = try patchSeed(input, "<hp:pic ", "<hp:ctrl><hp:fieldBegin id='77' type='HYPERLINK'/></hp:ctrl><hp:pic ");
    defer a.free(begin);
    const bytes = try patchSeed(begin, "</hp:pic>", "</hp:pic><hp:ctrl><hp:fieldEnd beginIDRef='77'/></hp:ctrl>");
    defer a.free(bytes);
    var s = try Editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try History.initV2(&s, .{});
    defer h.deinit();
    try t.expectError(error.ProtectedFieldRange, h.pictureCrop(&s, a, 0, try picture(&s)));
    const saved = try s.save();
    defer a.free(saved);
    try t.expectEqualSlices(u8, bytes, saved);
}
