const std = @import("std");
const t = std.testing;
const a = t.allocator;
const insertion = @import("image/image_insertion.zig");
const Format = enum { hwp5, hwpx };

fn sha(bytes: []const u8) [32]u8 {
    var value: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &value, .{});
    return value;
}
fn original(format: Format) ![]u8 {
    const bytes = try std.Io.Dir.cwd().readFileAlloc(t.io, if (format == .hwp5) "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwp" else "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwpx", a, .limited(insertion.picture_input.max_document_bytes));
    errdefer a.free(bytes);
    const expected = if (format == .hwp5) "b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f" else "6ee9014f23650987803481e7aa51b3b2201f91f549dccfe34880469621d62aab";
    const hex = std.fmt.bytesToHex(sha(bytes), .lower);
    try t.expectEqualStrings(expected, &hex);
    return bytes;
}
fn prepare(format: Format, input: []const u8, image: []const u8, request: insertion.Request) !insertion.Result {
    return if (format == .hwp5) @import("hwp5/edit/image_insertion_file.zig").prepare(a, input, image, request) else @import("hwpx/image_insertion_file.zig").prepare(a, input, image, request);
}

fn requestFor(format: Format, input: []const u8) !insertion.Request {
    var request: insertion.Request = .{ .expected_source_sha256 = sha(input), .target = .{ .section = 0, .paragraph = 0, .unit = 0 }, .expected_text = "", .width = 7200, .height = 3600 };
    if (format == .hwp5) {
        var document = try @import("hwp5/model_projection.zig").fromFile(a, input);
        defer document.deinit(a);
        for (document.sections[0].paragraphs, 0..) |paragraph, index| {
            if (paragraph.parent_node != null or paragraph.character_runs.len == 0) continue;
            const raw = try @import("hwp5/edit/plain_text_content.zig").textBytes(a, paragraph);
            defer a.free(raw);
            if (raw.len <= 2) continue;
            @import("hwp5/edit/plain_text_content.zig").validatePlain(raw) catch continue;
            request.target.paragraph = @intCast(index);
            request.target.unit = @intCast(raw.len / 2 - 1);
            request.expected_text = try insertion.utf8FromUtf16(a, raw);
            return request;
        }
    } else {
        var session = try @import("hwpx/editor_session.zig").open(a, input, .{});
        defer session.deinit();
        const rows = try @import("hwpx/paragraph_text_snapshot.zig").read(a, &session, 0);
        defer @import("hwpx/paragraph_text_snapshot.zig").free(a, rows);
        const tree = &session.sections[0].tree;
        for (rows) |row| {
            if (row.nested or row.text.len == 0) continue;
            request.target.paragraph = @intCast(row.paragraph);
            const text = session.anchorText(0, row.paragraph) catch continue;
            var counters: @import("hwpx/section_text.zig").Report = .{};
            const node = (try @import("hwpx/image_insertion_section.zig").locate(a, tree, request, &counters)) orelse {
                a.free(text);
                continue;
            };
            request.expected_text = text;
            const candidate = @import("hwpx/image_insertion_section.zig").write(a, tree, node, request, "", 16 * 1024 * 1024) catch |err| {
                a.free(text);
                if (err == error.OutOfMemory) return err;
                continue;
            };
            a.free(candidate);
            return request;
        }
    }
    return error.MissingEligiblePictureInsertionParagraph;
}

fn countPictures(format: Format, input: []const u8) !usize {
    if (format == .hwp5) {
        var source = try @import("hwp5/text_source.zig").Source.open(a, input);
        defer source.deinit();
        const section = try source.decodeSection(a, 0);
        defer a.free(section);
        const pictures = try @import("hwp5/edit/picture_sources.zig").read(a, section, source.header.version(), .base73);
        defer a.free(pictures);
        return pictures.len;
    }
    var document = try @import("hwpx/package.zig").inspectDocument(a, input, .{});
    defer document.deinit(a);
    var tree = try document.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    var pictures = try @import("hwpx/picture_image_links.zig").inspectSections(a, document.manifest, &.{tree}, .{});
    defer pictures.deinit(a);
    return pictures.sites.len;
}

fn success(format: Format, jpeg: bool) !void {
    const input = try original(format);
    defer a.free(input);
    const before = sha(input);
    const request = try requestFor(format, input);
    defer a.free(request.expected_text);
    const image = if (jpeg) image: {
        const source_bytes = try original(.hwpx);
        defer a.free(source_bytes);
        var source = try @import("hwpx/package.zig").inspectDocument(a, source_bytes, .{});
        defer source.deinit(a);
        break :image try source.archive.decode(source.archive.find("BinData/image1.jpg").?, insertion.picture_input.max_image_bytes);
    } else try @import("image/png/pixels_fixture.zig").image(a, 77);
    defer a.free(image);
    var result = try prepare(format, input, image, request);
    defer result.deinit(a);
    try t.expect(result.layout_requires_reflow);
    try t.expect(result.preview_stale);
    try t.expectEqual(@as(usize, 4), try countPictures(format, input));
    try t.expectEqual(@as(usize, 5), try countPictures(format, result.bytes));
    try t.expectEqual(before, sha(input));
    if (format == .hwp5) {
        const native = try @import("hwp5/edit/style_preservation.zig").Session.open(a, result.bytes);
        defer native.close();
        const raw = try native.copyText(a, 0, request.target.paragraph);
        defer a.free(raw);
        var text = try @import("hwp5/body/text.zig").Iterator.init(raw);
        var added: usize = 0;
        while (try text.next()) |token| if (token.value == .control and token.value.control.code == 11) {
            added += 1;
        };
        try t.expectEqual(@as(usize, 1), added);
    } else {
        var native = try @import("hwpx/editor_session.zig").open(a, result.bytes, .{});
        defer native.deinit();
        const raw = try native.anchorText(0, request.target.paragraph);
        defer a.free(raw);
        try t.expect(std.mem.indexOf(u8, raw, "\xef\xbf\xbc") != null);
    }
}

test "image insertion file H5 공식 Noori PNG 삽입·재열기·Native 조회" {
    try success(.hwp5, false);
}
test "image insertion file HX 공식 Noori PNG 삽입·재열기·Native 조회" {
    try success(.hwpx, false);
}
test "image insertion file H5 공식 Noori JPEG 삽입·재열기·Native 조회" {
    try success(.hwp5, true);
}
test "image insertion file HX 공식 Noori JPEG 삽입·재열기·Native 조회" {
    try success(.hwpx, true);
}

test "image insertion file 원본 SHA·원문·주소·위치·크기 실패는 원본 불변" {
    const image = try @import("image/png/pixels_fixture.zig").image(a, 77);
    defer a.free(image);
    for ([_]Format{ .hwp5, .hwpx }) |format| {
        const input = try original(format);
        defer a.free(input);
        const before = sha(input);
        const request = try requestFor(format, input);
        defer a.free(request.expected_text);
        var invalid = request;
        invalid.expected_source_sha256[0] ^= 1;
        try t.expectError(error.SourceHashMismatch, prepare(format, input, image, invalid));
        invalid = request;
        invalid.expected_text = "다른 원문";
        invalid.target.unit = 0;
        try t.expectError(error.PictureInsertionTextMismatch, prepare(format, input, image, invalid));
        invalid = request;
        invalid.target.unit = std.math.maxInt(u32);
        try t.expectError(error.InvalidPictureInsertionPosition, prepare(format, input, image, invalid));
        invalid = request;
        invalid.width = 0;
        try t.expectError(error.InvalidPictureInsertionSize, prepare(format, input, image, invalid));
        invalid = request;
        invalid.target.paragraph = std.math.maxInt(u32);
        if (prepare(format, input, image, invalid)) |result| {
            var owned = result;
            owned.deinit(a);
            return error.ExpectedInvalidParagraph;
        } else |_| {}
        try t.expectEqual(before, sha(input));
    }
}

test "image insertion file H5 그림 꼬리 instance도 예약하여 충돌 회피" {
    const input = try original(.hwp5);
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    const section = try source.decodeSection(a, 0);
    defer a.free(section);
    var iterator = @import("hwp5/record.zig").Iterator.init(section, .{});
    var changed = false;
    while (try iterator.next()) |row| {
        if (row.tag != 85) continue;
        try t.expect(row.payload.len >= 82);
        const offset = row.offset + row.raw.len - row.payload.len + 74;
        std.mem.writeInt(u32, section[offset..][0..4], 1, .little);
        changed = true;
        break;
    }
    try t.expect(changed);
    const encoded = if (source.header.has(.compressed)) try @import("compression/raw_deflate.zig").encodeStored(a, section, 32 * 1024 * 1024) else try a.dupe(u8, section);
    defer a.free(encoded);
    const nodes = try source.file.toNodes(a);
    defer a.free(nodes);
    const index = try @import("hwp5/container/paths.zig").required(&source.file, "/BodyText/Section0", 2);
    nodes[try source.file.nodeIndex(index)].content = encoded;
    const derived = try @import("cfb/writer.zig").write(a, nodes, .{ .version = source.file.header.major, .limits = @import("hwp5/text_source.zig").cfb_limits });
    defer a.free(derived);
    const request = try requestFor(.hwp5, derived);
    defer a.free(request.expected_text);
    const image = try @import("image/png/pixels_fixture.zig").image(a, 77);
    defer a.free(image);
    var result = try prepare(.hwp5, derived, image, request);
    defer result.deinit(a);
    try t.expect(result.instance_id != 1);
}
