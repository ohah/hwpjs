//! 선택 ViewText 구역들을 한 번 교체하는 내부 CFB 저장 경계입니다.
const std = @import("std");
const Source = @import("../text_source.zig").Source;
const cfb = @import("../../cfb/reader.zig");
pub const Options = struct {
    max_input_bytes: usize = 64 * 1024 * 1024,
    max_section_bytes: usize = 32 * 1024 * 1024,
    max_total_section_bytes: usize = 64 * 1024 * 1024,
    max_total_original_section_bytes: usize = 64 * 1024 * 1024,
    max_output_bytes: usize = 128 * 1024 * 1024,
};
pub const Replacement = struct { section: usize, plaintext: []const u8 };

pub fn replace(a: std.mem.Allocator, input: []const u8, section: usize, plaintext: []const u8, options: Options) ![]u8 {
    return replaceMany(a, input, &.{.{ .section = section, .plaintext = plaintext }}, options);
}

pub fn replaceMany(a: std.mem.Allocator, input: []const u8, replacements: []const Replacement, options: Options) ![]u8 {
    if (input.len > options.max_input_bytes) return error.LimitExceeded;
    if (replacements.len == 0) return error.EmptyReplacementSet;
    var source = try Source.openReadOnly(a, input);
    defer source.deinit();
    if (!source.header.has(.distribution)) return error.NotDistributionDocument;
    if (!source.header.has(.compressed)) return error.UnsupportedDistributionCompression;
    if (source.header.has(.history) or source.header.has(.digital_signature) or source.header.has(.signature_preview)) return error.UnsupportedDistributionSaveFeatures;
    const seen = try a.alloc(bool, source.section_count);
    defer a.free(seen);
    @memset(seen, false);
    var total: usize = 0;
    for (replacements) |replacement| {
        if (replacement.section >= source.section_count) return error.InvalidSectionIndex;
        if (seen[replacement.section]) return error.DuplicateSectionReplacement;
        seen[replacement.section] = true;
        if (replacement.plaintext.len > options.max_section_bytes or replacement.plaintext.len > options.max_total_section_bytes -| total) return error.LimitExceeded;
        total += replacement.plaintext.len;
    }
    const prepared = try a.alloc(cfb.stream_replace.Replacement, replacements.len);
    var initialized: usize = 0;
    var original_remaining = options.max_total_original_section_bytes;
    defer {
        for (prepared[0..initialized]) |replacement| {
            a.free(replacement.path);
            a.free(replacement.content);
        }
        a.free(prepared);
    }
    for (replacements) |replacement| {
        var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, replacement.plaintext, source.header.version(), .{});
        defer tree.deinit(a);
        const path = try std.fmt.allocPrint(a, "/ViewText/Section{d}", .{replacement.section});
        errdefer a.free(path);
        const encoded = try @import("encode.zig").encodeCompressedWithReport(a, try source.file.readStream(a, path), replacement.plaintext, .{
            .max_input_bytes = options.max_input_bytes,
            .max_plaintext_bytes = options.max_section_bytes,
            .max_original_plaintext_bytes = original_remaining,
            .max_output_bytes = options.max_output_bytes,
        });
        original_remaining -= encoded.original_plaintext_bytes;
        prepared[initialized] = .{ .path = path, .content = encoded.bytes };
        initialized += 1;
    }
    const output = try cfb.stream_replace.rebuildManyExact(a, &source.file, prepared, .{ .max_output_bytes = options.max_output_bytes });
    errdefer a.free(output);
    var reopened = try Source.openReadOnly(a, output);
    defer reopened.deinit();
    if (reopened.section_count != source.section_count or !std.mem.eql(u8, &reopened.header.raw, &source.header.raw)) return error.SourceBindingMismatch;
    for (replacements) |replacement| {
        const verified = try reopened.decodeSection(a, replacement.section);
        defer a.free(verified);
        if (!std.mem.eql(u8, replacement.plaintext, verified)) return error.SourceBindingMismatch;
    }
    return output;
}

test "distribution section CFB save preserves every unrelated stream and original flags" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "distribution", "viewtext" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4000000));
        defer a.free(input);
        var source = try Source.openReadOnly(a, input);
        defer source.deinit();
        const plain = try source.decodeSection(a, 0);
        defer a.free(plain);
        const output = try replace(a, input, 0, plain, .{});
        defer a.free(output);
        var reopened = try Source.openReadOnly(a, output);
        defer reopened.deinit();
        for (source.file.entries) |entry| {
            if (entry.kind == 0) continue;
            const relative = if (entry.kind == 5) "/" else entry.path[source.file.entries[0].path.len..];
            const selected = (try reopened.file.findExact(relative)) orelse return error.StreamNotFound;
            const after = reopened.file.entries[selected];
            try std.testing.expectEqual(entry.kind, after.kind);
            try std.testing.expectEqualSlices(u8, &entry.clsid, &after.clsid);
            try std.testing.expectEqual(entry.state, after.state);
            try std.testing.expectEqual(entry.created, after.created);
            try std.testing.expectEqual(entry.modified, after.modified);
            if (entry.kind == 2 and !std.mem.eql(u8, relative, "ViewText/Section0")) try std.testing.expectEqualSlices(u8, entry.content, after.content);
        }
        try std.testing.expectError(error.UnsupportedDistribution, Source.open(a, output));
        try std.testing.expectError(error.InvalidSectionIndex, replace(a, input, source.section_count, plain, .{}));
        try std.testing.expectError(error.LimitExceeded, replace(a, input, 0, plain, .{ .max_output_bytes = 1 }));
        try std.testing.expectError(error.EmptyReplacementSet, replaceMany(a, input, &.{}, .{}));
        try std.testing.expectError(error.DuplicateSectionReplacement, replaceMany(a, input, &.{ .{ .section = 0, .plaintext = plain }, .{ .section = 0, .plaintext = plain } }, .{}));
        try std.testing.expectError(error.LimitExceeded, replaceMany(a, input, &.{.{ .section = 0, .plaintext = plain }}, .{ .max_total_section_bytes = plain.len - 1 }));
    }
}

test "distribution section CFB save allocation failures keep source and deterministic output" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/viewtext.hwp", a, .limited(4000000));
    defer a.free(input);
    const snapshot = try a.dupe(u8, input);
    defer a.free(snapshot);
    var source = try Source.openReadOnly(a, input);
    defer source.deinit();
    const plain = try source.decodeSection(a, 0);
    defer a.free(plain);
    const reference = try replace(a, input, 0, plain, .{});
    defer a.free(reference);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, original: []const u8, before: []const u8, payload: []const u8, expected: []const u8) !void {
            const output = replace(allocator, original, 0, payload, .{}) catch |err| {
                try std.testing.expectEqualSlices(u8, before, original);
                return err;
            };
            defer allocator.free(output);
            try std.testing.expectEqualSlices(u8, expected, output);
            try std.testing.expectEqualSlices(u8, before, original);
        }
    };
    try Probe.run(a, input, snapshot, plain, reference);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ @as([]const u8, input), @as([]const u8, snapshot), @as([]const u8, plain), @as([]const u8, reference) });
}

test "distribution section CFB save retains actual model text edit after reopen" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/viewtext.hwp", a, .limited(4000000));
    defer a.free(input);
    var source = try Source.openReadOnly(a, input);
    defer source.deinit();
    const plain = try source.decodeSection(a, 0);
    defer a.free(plain);
    const docinfo = try @import("../stream.zig").decodeWithPolicy(a, &source.header, try source.file.readStream(a, "/DocInfo"), 32000000, .observed_viewtext);
    defer a.free(docinfo);
    var records = @import("../record.zig").Iterator.init(docinfo, .{});
    var char_count: usize = 0;
    while (try records.next()) |record| if (record.tag == @intFromEnum(@import("../docinfo/reader.zig").Tag.char_shape)) {
        char_count += 1;
    };
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{plain});
    defer document.deinit(a);
    try @import("../edit/plain_text.zig").apply(a, plain, source.header.version(), &document.sections[0].paragraphs[0], .{ .section = 0, .paragraph = 0, .start_unit = 0, .end_unit = 0, .utf8 = "배포편집😀<&" }, char_count);
    const edited = try @import("../edit/text_section_writer.zig").write(a, plain, document.sections[0], source.header.version(), 32000000);
    defer a.free(edited);
    const output = try replace(a, input, 0, edited, .{});
    defer a.free(output);
    var reopened = try Source.openReadOnly(a, output);
    defer reopened.deinit();
    const restored = try reopened.decodeSection(a, 0);
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, edited, restored);
    try std.testing.expect(!std.mem.eql(u8, plain, restored));
    try std.testing.expect(reopened.header.has(.distribution));
}

test "distribution section CFB save rejects signature and history without modifying input" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/viewtext.hwp", a, .limited(4000000));
    defer a.free(input);
    var source = try Source.openReadOnly(a, input);
    defer source.deinit();
    const plain = try source.decodeSection(a, 0);
    defer a.free(plain);
    const Flag = @import("../file_header.zig").Flag;
    for ([_]Flag{ .history, .digital_signature, .signature_preview }) |flag| {
        var header = source.header.raw;
        std.mem.writeInt(u32, header[36..40], source.header.flags() | (@as(u32, 1) << @intFromEnum(flag)), .little);
        const modified = try cfb.stream_replace.rebuildExact(a, &source.file, "/FileHeader", &header, .{});
        defer a.free(modified);
        const before = try a.dupe(u8, modified);
        defer a.free(before);
        try std.testing.expectError(error.UnsupportedDistributionSaveFeatures, replace(a, modified, 0, plain, .{}));
        try std.testing.expectEqualSlices(u8, before, modified);
    }
}

test "distribution section CFB save batch handles six section source atomically" {
    const a = std.testing.allocator;
    const input = try @import("../container/distribution_test_fixture.zig").make(a, false, false);
    defer a.free(input);
    const before = try a.dupe(u8, input);
    defer a.free(before);
    var source = try Source.openReadOnly(a, input);
    defer source.deinit();
    try std.testing.expectEqual(@as(u16, 6), source.section_count);
    const plain = try source.decodeSection(a, 0);
    defer a.free(plain);
    const requests = [_]Replacement{ .{ .section = 5, .plaintext = plain }, .{ .section = 1, .plaintext = plain } };
    const reference = try replaceMany(a, input, &requests, .{});
    defer a.free(reference);
    var reopened = try Source.openReadOnly(a, reference);
    defer reopened.deinit();
    for (0..6) |section| {
        const original = try source.decodeSection(a, section);
        defer a.free(original);
        const restored = try reopened.decodeSection(a, section);
        defer a.free(restored);
        try std.testing.expectEqualSlices(u8, original, restored);
    }
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, replacements: []const Replacement, expected: []const u8) !void {
            const output = try replaceMany(allocator, bytes, replacements, .{});
            defer allocator.free(output);
            try std.testing.expectEqualSlices(u8, expected, output);
        }
    };
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ @as([]const u8, input), @as([]const Replacement, &requests), @as([]const u8, reference) });
    try std.testing.expectError(error.UnexpectedEnd, replaceMany(a, input, &.{ requests[0], .{ .section = 1, .plaintext = &.{255} } }, .{}));
    try std.testing.expectError(error.InvalidSectionIndex, replaceMany(a, input, &.{ requests[0], .{ .section = 6, .plaintext = plain } }, .{}));
    try std.testing.expectError(error.DuplicateSectionReplacement, replaceMany(a, input, &.{ requests[0], requests[0] }, .{}));
    try std.testing.expectError(error.LimitExceeded, replaceMany(a, input, &requests, .{ .max_total_section_bytes = plain.len * 2 - 1 }));
    const exact = try replaceMany(a, input, &requests, .{ .max_total_original_section_bytes = plain.len * 2 });
    defer a.free(exact);
    try std.testing.expectEqualSlices(u8, reference, exact);
    try std.testing.expectError(error.LimitExceeded, replaceMany(a, input, &requests, .{ .max_total_original_section_bytes = plain.len * 2 - 1 }));
    try std.testing.expectEqualSlices(u8, before, input);
}
