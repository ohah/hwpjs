const std = @import("std");
const projection = @import("model_projection.zig");

fn record(a: std.mem.Allocator, out: *std.ArrayList(u8), tag: u32, level: u32, payload: []const u8) !void {
    const bits = tag | (level << 10) | (@as(u32, @intCast(payload.len)) << 20);
    var header: [4]u8 = undefined;
    std.mem.writeInt(u32, &header, bits, .little);
    try out.appendSlice(a, &header);
    try out.appendSlice(a, payload);
}

fn paragraphHeader(units: u32, runs: u16, style: u8, para_shape: u16) [22]u8 {
    var out: [22]u8 = @splat(0);
    std.mem.writeInt(u32, out[0..4], units, .little);
    std.mem.writeInt(u16, out[8..10], para_shape, .little);
    out[10] = style;
    std.mem.writeInt(u16, out[12..14], runs, .little);
    return out;
}

test "HWP5 projection owns text and preserves order, style references and deferred records" {
    const a = std.testing.allocator;
    var input: std.ArrayList(u8) = .empty;
    defer input.deinit(a);
    const first = paragraphHeader(2, 1, 3, 4);
    try record(a, &input, 66, 0, &first);
    try record(a, &input, 67, 1, &.{ 'A', 0, 'B', 0 });
    const run: [8]u8 = .{ 0, 0, 0, 0, 7, 0, 0, 0 };
    try record(a, &input, 68, 1, &run);
    try record(a, &input, 99, 1, &.{0xaa});
    const second = paragraphHeader(0, 0, 0, 0);
    try record(a, &input, 66, 0, &second);

    const sections = [_][]const u8{input.items};
    var doc = try projection.fromDecodedSections(a, .{ .raw = 0x05000000 }, &sections);
    defer doc.deinit(a);
    try std.testing.expectEqual(.hwp5, doc.format);
    try std.testing.expectEqual(@as(usize, 1), doc.sections.len);
    try std.testing.expectEqual(@as(usize, 5), doc.sections[0].source_record_count);
    try std.testing.expectEqual(@as(usize, 2), doc.sections[0].paragraphs.len);
    const p = doc.sections[0].paragraphs[0];
    try std.testing.expectEqual(@as(u16, 4), p.para_shape_id);
    try std.testing.expectEqual(@as(u8, 3), p.style_id);
    try std.testing.expectEqual(@as(usize, 1), p.character_runs.len);
    try std.testing.expectEqual(@as(u32, 7), p.character_runs[0].char_shape_id);
    try std.testing.expectEqual(@as(usize, 1), p.deferred_direct_records);
    try std.testing.expectEqualSlices(u8, &.{ 'A', 0, 'B', 0 }, p.tokens[0].raw);
    @memset(input.items, 0);
    try std.testing.expectEqualSlices(u8, &.{ 'A', 0, 'B', 0 }, p.tokens[0].raw);
    try std.testing.expect(!doc.sections[0].paragraphs[1].text_present);
}

test "HWP5 projection rejects malformed character run counts without inventing defaults" {
    const a = std.testing.allocator;
    var input: std.ArrayList(u8) = .empty;
    defer input.deinit(a);
    const header = paragraphHeader(0, 1, 0, 0);
    try record(a, &input, 66, 0, &header);
    const sections = [_][]const u8{input.items};
    try std.testing.expectError(error.ParagraphMetadataCountMismatch, projection.fromDecodedSections(a, .{ .raw = 0x05000000 }, &sections));
}

test "HWP5 projection refuses missing sections and unsupported versions" {
    const a = std.testing.allocator;
    const empty = [_][]const u8{};
    try std.testing.expectError(error.InvalidSectionCount, projection.fromDecodedSections(a, .{ .raw = 0x05000000 }, &empty));
    const one = [_][]const u8{""};
    try std.testing.expectError(error.UnsupportedVersion, projection.fromDecodedSections(a, .{ .raw = 0x06000000 }, &one));
}

test "HWP5 projection reads a real fixture after shared container and stream decoding" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/example.hwp", a, .limited(2_000_000));
    defer a.free(bytes);
    var file = try @import("../cfb/reader.zig").File.open(a, bytes, .{ .strict = true });
    defer file.deinit();
    const header_bytes = try file.readStream(a, "/FileHeader");
    const header = try @import("file_header.zig").Header.parse(header_bytes);
    const raw = try file.readStream(a, "/BodyText/Section0");
    const decoded = try @import("stream.zig").decode(a, &header, raw, 32 * 1024 * 1024);
    defer a.free(decoded);
    const sections = [_][]const u8{decoded};
    var doc = try projection.fromDecodedSections(a, header.version(), &sections);
    defer doc.deinit(a);
    try std.testing.expectEqual(@as(usize, 15), doc.sections[0].paragraphs.len);
    try std.testing.expect(doc.sections[0].paragraphs[0].text_present);
    try std.testing.expect(doc.sections[0].paragraphs[0].tokens.len > 0);
    var from_file = try projection.fromFile(a, bytes);
    defer from_file.deinit(a);
    try std.testing.expectEqual(doc.sections[0].paragraphs.len, from_file.sections[0].paragraphs.len);
    try std.testing.expectEqualSlices(u8, doc.sections[0].paragraphs[0].tokens[0].raw, from_file.sections[0].paragraphs[0].tokens[0].raw);
}

test "HWP5 projection cleans up every allocation failure" {
    const a = std.testing.allocator;
    var input: std.ArrayList(u8) = .empty;
    defer input.deinit(a);
    const header = paragraphHeader(2, 1, 0, 0);
    try record(a, &input, 66, 0, &header);
    try record(a, &input, 67, 1, &.{ 'A', 0, 'B', 0 });
    try record(a, &input, 68, 1, &.{ 0, 0, 0, 0, 0, 0, 0, 0 });
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            const sections = [_][]const u8{ bytes, bytes };
            var doc = try projection.fromDecodedSections(allocator, .{ .raw = 0x05000000 }, &sections);
            defer doc.deinit(allocator);
        }
    }.run, .{input.items});
}

test "HWP5 projection from file preserves independent legacy section paragraph counts" {
    const a = std.testing.allocator;
    const cases = .{
        .{ "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwp", @as(usize, 21) },
        .{ "legacy/rust/crates/hwp-core/tests/fixtures/table.hwp", @as(usize, 2) },
        .{ "legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwp", @as(usize, 2) },
    };
    inline for (cases) |case| {
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, case[0], a, .limited(10_000_000));
        defer a.free(bytes);
        var doc = try projection.fromFile(a, bytes);
        defer doc.deinit(a);
        try std.testing.expectEqual(@as(usize, 1), doc.sections.len);
        var root_paragraphs: usize = 0;
        for (doc.sections[0].paragraphs) |paragraph| {
            if (paragraph.parent_node == null) root_paragraphs += 1;
        }
        try std.testing.expectEqual(case[1], root_paragraphs);
    }
}

test "HWP5 projection from file cleans up allocation failure" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/example.hwp", a, .limited(2_000_000));
    defer a.free(bytes);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: []const u8) !void {
            var doc = try projection.fromFile(allocator, input);
            defer doc.deinit(allocator);
        }
    }.run, .{bytes});
}
