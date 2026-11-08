const std = @import("std");
const t = std.testing;
const replacement = @import("picture_resource_replacement.zig");
const Source = @import("../text_source.zig").Source;
const pictures = @import("picture_sources.zig");
const records = @import("../record.zig");
const BinData = @import("../docinfo/bin_data.zig").BinData;
const writer = @import("../../cfb/writer.zig");
const a = t.allocator;

fn sha(bytes: []const u8) [32]u8 {
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &digest, .{});
    return digest;
}
fn noori() ![]u8 {
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwp", a, .limited(8 * 1024 * 1024));
    errdefer a.free(bytes);
    const hex = std.fmt.bytesToHex(sha(bytes), .lower);
    try t.expectEqualStrings("b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f", &hex);
    return bytes;
}
fn firstPicture(input: []const u8) !pictures.Source {
    var source = try Source.open(a, input);
    defer source.deinit();
    const section = try source.decodeSection(a, 0);
    defer a.free(section);
    const values = try pictures.read(a, section, source.header.version(), .base73);
    defer a.free(values);
    try t.expect(values.len >= 2);
    return values[0];
}
fn encoded(source: *const Source, bytes: []const u8) ![]u8 {
    return if (source.header.has(.compressed)) @import("../../compression/raw_deflate.zig").encodeStored(a, bytes, 32 * 1024 * 1024) else a.dupe(u8, bytes);
}
const Derived = struct {
    version: ?u16 = null,
    shared: bool = false,
    collision: bool = false,
    flags: u32 = 0,
    link: bool = false,
    bad_count: bool = false,
};
// 원본은 보존하고, 명시한 반례만 메모리에서 파생합니다.
fn derive(input: []const u8, options: Derived) ![]u8 {
    var source = try Source.open(a, input);
    defer source.deinit();
    const nodes = try source.file.toNodes(a);
    defer a.free(nodes);
    var header = source.header.raw;
    std.mem.writeInt(u32, header[36..40], source.header.flags() | options.flags, .little);
    const header_index = (try source.file.findExact("/FileHeader")).?;
    nodes[try source.file.nodeIndex(header_index)].content = &header;
    const original_section = try source.decodeSection(a, 0);
    defer a.free(original_section);
    const section = try a.dupe(u8, original_section);
    defer a.free(section);
    if (options.shared) {
        const values = try pictures.read(a, section, source.header.version(), .base73);
        defer a.free(values);
        try t.expect(values.len >= 2);
        var tree = try @import("source_tree.zig").parse(a, section, source.header.version(), .{});
        defer tree.deinit(a);
        const record = tree.nodes[values[1].picture_node].record.framing;
        const offset = record.offset + record.raw.len - record.payload.len + 71;
        std.mem.writeInt(u16, section[offset..][0..2], values[0].bin_data_id, .little);
    }
    const section_bytes = try encoded(&source, section);
    defer a.free(section_bytes);
    const section_index = (try source.file.findExact("/BodyText/Section0")).?;
    nodes[try source.file.nodeIndex(section_index)].content = section_bytes;
    const original_info = try source.decodeDocInfo(a, 32 * 1024 * 1024);
    defer a.free(original_info);
    var info: std.ArrayList(u8) = .empty;
    defer info.deinit(a);
    var iterator = records.Iterator.init(original_info, .{});
    var replaced = false;
    while (try iterator.next()) |record| {
        if (options.link and !replaced and record.tag == 18) {
            try @import("../record_writer.zig").append(a, &info, 18, 1, &.{ 0, 0, 0, 0, 0, 0 }, 32 * 1024 * 1024);
            replaced = true;
        } else {
            const offset = info.items.len;
            try info.appendSlice(a, record.raw);
            if (options.bad_count and record.tag == 17) std.mem.writeInt(i32, info.items[offset + record.raw.len - record.payload.len ..][0..4], -1, .little);
        }
    }
    const info_bytes = try encoded(&source, info.items);
    defer a.free(info_bytes);
    const info_index = (try source.file.findExact("/DocInfo")).?;
    nodes[try source.file.nodeIndex(info_index)].content = info_bytes;
    const output_nodes = try a.alloc(writer.Node, nodes.len + @intFromBool(options.collision));
    defer a.free(output_nodes);
    @memcpy(output_nodes[0..nodes.len], nodes);
    if (options.collision) {
        try t.expectEqual(@as(?usize, null), try source.file.findExact("/BinData/BIN0005.png"));
        output_nodes[nodes.len] = .{ .name = "BIN0005.png", .parent = @intCast(try source.file.nodeIndex((try source.file.findExact("/BinData")).?)), .content = "원본의 미참조 스트림 보존" };
    }
    return writer.write(a, output_nodes, .{ .version = options.version orelse source.file.header.major, .limits = @import("../text_source.zig").cfb_limits });
}

fn checkResult(input: []const u8, result: replacement.Result, image: []const u8) !void {
    var before = try Source.open(a, input);
    defer before.deinit();
    var after = try Source.open(a, result.bytes);
    defer after.deinit();
    try t.expectEqual(before.file.header.major, after.file.header.major);
    const old_section = try before.decodeSection(a, 0);
    defer a.free(old_section);
    const new_section = try after.decodeSection(a, 0);
    defer a.free(new_section);
    const old_pictures = try pictures.read(a, old_section, before.header.version(), .base73);
    defer a.free(old_pictures);
    const new_pictures = try pictures.read(a, new_section, after.header.version(), .base73);
    defer a.free(new_pictures);
    try t.expectEqual(old_pictures.len, new_pictures.len);
    for (old_pictures, new_pictures, 0..) |old, current, index| {
        var expected = old;
        if (index == 0) expected.bin_data_id = result.bin_data_ordinal;
        try t.expectEqualDeep(expected, current);
    }
    var tree = try @import("source_tree.zig").parse(a, old_section, before.header.version(), .{});
    defer tree.deinit(a);
    const record = tree.nodes[old_pictures[0].picture_node].record.framing;
    const at = record.offset + record.raw.len - record.payload.len + 71;
    try t.expectEqualSlices(u8, old_section[0..at], new_section[0..at]);
    try t.expectEqualSlices(u8, old_section[at + 2 ..], new_section[at + 2 ..]);
    const info = try after.decodeDocInfo(a, 32 * 1024 * 1024);
    defer a.free(info);
    var iterator = records.Iterator.init(info, .{});
    var bin_count: usize = 0;
    var selected: ?BinData = null;
    while (try iterator.next()) |r| if (r.tag == 18) {
        bin_count += 1;
        if (bin_count == result.bin_data_ordinal) selected = try BinData.parse(r.payload);
    };
    try t.expectEqual(@as(usize, result.bin_data_ordinal), bin_count);
    try t.expect(selected.?.data == .embedding);
    try t.expectEqual(result.storage_id, selected.?.data.embedding.id);
    try t.expectEqual(@import("../docinfo/bin_data.zig").Compression.uncompressed, selected.?.compression());
    const new_stream = after.file.entries[(try after.file.findExact(result.resource_path)).?].content;
    try t.expectEqualSlices(u8, image, new_stream);
    const old_info = try before.decodeDocInfo(a, 32 * 1024 * 1024);
    defer a.free(old_info);
    var old_records = records.Iterator.init(old_info, .{});
    var new_records = records.Iterator.init(info, .{});
    var ordinal: usize = 0;
    while (try new_records.next()) |current| {
        if (current.tag == 18) {
            ordinal += 1;
            if (ordinal == result.bin_data_ordinal) continue;
        }
        const prior = (try old_records.next()) orelse return error.UnexpectedDocInfoResource;
        if (current.tag == 17) {
            try t.expectEqualSlices(u8, prior.raw[0 .. prior.raw.len - prior.payload.len], current.raw[0 .. current.raw.len - current.payload.len]);
            try t.expectEqualSlices(u8, prior.payload[4..], current.payload[4..]);
            try t.expectEqual(std.mem.readInt(i32, prior.payload[0..4], .little) + 1, std.mem.readInt(i32, current.payload[0..4], .little));
        } else try t.expectEqualSlices(u8, prior.raw, current.raw);
    }
    try t.expect((try old_records.next()) == null);
    for (before.file.entries, 0..) |entry, index| {
        if (entry.kind == 0) continue;
        const path = try before.file.rootRelativePath(index);
        const kept = after.file.entries[if (index == 0) @as(usize, 0) else (try after.file.findExact(path)).?];
        if (entry.kind == 2 and !std.mem.eql(u8, path, "/DocInfo") and !std.mem.eql(u8, path, "/BodyText/Section0")) try t.expectEqualSlices(u8, entry.content, kept.content);
        try t.expectEqual(entry.clsid, kept.clsid);
        try t.expectEqual(entry.state, kept.state);
        try t.expectEqual(entry.created, kept.created);
        try t.expectEqual(entry.modified, kept.modified);
    }
    try t.expect(result.preview_stale);
}

test "picture resource cow 실제 Noori 선택 PNG와 다른 그림·스트림 보존" {
    const input = try noori();
    defer a.free(input);
    const original = sha(input);
    const png = try @import("../../image/png/pixels_fixture.zig").image(a, 77);
    defer a.free(png);
    const target = try firstPicture(input);
    var result = try replacement.prepare(a, input, 0, target.picture_node, png, .{});
    defer result.deinit(a);
    try checkResult(input, result, png);
    try t.expectEqualStrings("image/png", result.media_type);
    try t.expectEqual(original, sha(input));
}

test "picture resource cow 공유 원본 리소스를 CFB v3와 v4에서 격리" {
    const original = try noori();
    defer a.free(original);
    const png = try @import("../../image/png/pixels_fixture.zig").image(a, 78);
    defer a.free(png);
    for ([_]u16{ 3, 4 }) |version| {
        const input = try derive(original, .{ .shared = true, .version = version });
        defer a.free(input);
        const before = sha(input);
        const target = try firstPicture(input);
        var result = try replacement.prepare(a, input, 0, target.picture_node, png, .{});
        defer result.deinit(a);
        try checkResult(input, result, png);
        try t.expectEqual(before, sha(input));
    }
}

test "picture resource cow 경로 충돌과 반복 교체에서 원본 스트림 보존" {
    const original = try noori();
    defer a.free(original);
    const input = try derive(original, .{ .collision = true });
    defer a.free(input);
    const png = try @import("../../image/png/pixels_fixture.zig").image(a, 79);
    defer a.free(png);
    const target = try firstPicture(input);
    var first = try replacement.prepare(a, input, 0, target.picture_node, png, .{});
    defer first.deinit(a);
    try t.expect(first.storage_id != 5);
    try checkResult(input, first, png);
    var second = try replacement.prepare(a, first.bytes, 0, target.picture_node, png, .{});
    defer second.deinit(a);
    try t.expect(second.storage_id != first.storage_id);
    try t.expectEqual(first.bin_data_ordinal + 1, second.bin_data_ordinal);
    try checkResult(first.bytes, second, png);
}

test "picture resource cow 잘못된 대상·CRC·크기 예산 거부와 입력 보존" {
    const input = try noori();
    defer a.free(input);
    const before = sha(input);
    const png = try @import("../../image/png/pixels_fixture.zig").image(a, 80);
    defer a.free(png);
    const target = try firstPicture(input);
    try t.expectError(error.InvalidSection, replacement.prepare(a, input, 999, target.picture_node, png, .{}));
    try t.expectError(error.InvalidPictureResourceTarget, replacement.prepare(a, input, 0, 0, png, .{}));
    try t.expectError(error.UnsupportedReplacementImageFormat, replacement.prepare(a, input, 0, target.picture_node, "GIF89a", .{}));
    try t.expectError(error.ImageByteLimitExceeded, replacement.prepare(a, input, 0, target.picture_node, png, .{ .max_image_bytes = png.len - 1 }));
    try t.expectError(error.LimitExceeded, replacement.prepare(a, input, 0, target.picture_node, png, .{ .max_input_bytes = input.len - 1 }));
    try t.expectError(error.LimitExceeded, replacement.prepare(a, input, 0, target.picture_node, png, .{ .max_output_bytes = 1 }));
    png[29] ^= 1;
    try t.expectError(error.InvalidChecksum, replacement.prepare(a, input, 0, target.picture_node, png, .{}));
    try t.expectEqual(before, sha(input));
}

test "picture resource cow 보호·서명·외부 링크·잘못된 매핑 거부" {
    const original = try noori();
    defer a.free(original);
    const png = try @import("../../image/png/pixels_fixture.zig").image(a, 81);
    defer a.free(png);
    const target = try firstPicture(original);
    const errors = [_]anyerror{ error.UnsupportedEncryption, error.UnsupportedDistribution, error.UnsupportedDrm, error.UnsupportedPictureReplacementSignature };
    for ([_]u32{ 2, 4, 16, 128 }, errors) |flag, expected| {
        const input = try derive(original, .{ .flags = flag });
        defer a.free(input);
        const before = sha(input);
        try t.expectError(expected, replacement.prepare(a, input, 0, target.picture_node, png, .{}));
        try t.expectEqual(before, sha(input));
    }
    const external = try derive(original, .{ .link = true });
    defer a.free(external);
    try t.expectError(error.ExternalPictureImage, replacement.prepare(a, external, 0, target.picture_node, png, .{}));
    const malformed = try derive(original, .{ .bad_count = true });
    defer a.free(malformed);
    try t.expectError(error.NegativeMappingCount, replacement.prepare(a, malformed, 0, target.picture_node, png, .{}));
}

test "picture resource cow 모든 할당 실패에서 빌린 원본 보존" {
    const input = try noori();
    defer a.free(input);
    const before = sha(input);
    const png = try @import("../../image/png/pixels_fixture.zig").image(a, 82);
    defer a.free(png);
    const target = try firstPicture(input);
    try t.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, picture: usize, image: []const u8) !void {
            var result = try replacement.prepare(allocator, bytes, 0, picture, image, .{});
            defer result.deinit(allocator);
        }
    }.run, .{ input, target.picture_node, png });
    try t.expectEqual(before, sha(input));
}

test "picture resource cow JPEG 교체 형식과 신규 리소스 소유권 재열기" {
    const input = try noori();
    defer a.free(input);
    const target = try firstPicture(input);
    var source = try Source.open(a, input);
    defer source.deinit();
    const info = try source.decodeDocInfo(a, 32 * 1024 * 1024);
    defer a.free(info);
    var iterator = records.Iterator.init(info, .{});
    var ordinal: usize = 0;
    var selected: ?BinData = null;
    while (try iterator.next()) |record| if (record.tag == 18) {
        ordinal += 1;
        if (ordinal == target.bin_data_id) selected = try BinData.parse(record.payload);
    };
    const item = selected orelse return error.MissingTestPicture;
    const old = (try item.target(.observed_optional_extension)).?;
    const path = try @import("../container/paths.zig").binary(a, old.id, old.extension_utf16 orelse &.{});
    defer a.free(path);
    const raw = source.file.entries[(try source.file.findExact(path)).?].content;
    const jpeg = try @import("../bin_data_stream.zig").decode(a, &source.header, item, raw, 8 * 1024 * 1024);
    defer a.free(jpeg);
    try t.expectEqualSlices(u8, &.{ 0xff, 0xd8, 0xff }, jpeg[0..3]);
    var result = try replacement.prepare(a, input, 0, target.picture_node, jpeg, .{});
    defer result.deinit(a);
    try t.expectEqualStrings("image/jpeg", result.media_type);
    try t.expect(std.mem.endsWith(u8, result.resource_path, ".jpg"));
    try checkResult(input, result, jpeg);
}
