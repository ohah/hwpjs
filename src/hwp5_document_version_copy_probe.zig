const std = @import("std");
const copy = @import("hwp5/edit/document_version_copy.zig");
const options: copy.Options = .{
    .draft = .{
        .docinfo = .{ .character = .{ .border_fill_id = 0, .inactive_strike_color = 0 } },
        .drawings = .{ .shadow = .{ .kind = 0, .color = 0, .offset_x = 0, .offset_y = 0 }, .metadata_reserved = 0, .shadow_alpha = 0 },
    },
    .allow_unverified_copy = true,
};

fn verify(a: std.mem.Allocator, input: []const u8, result: copy.Result) !void {
    try std.testing.expect(!result.complete_document);
    try std.testing.expectEqual(.structural_only, result.verification);
    var old = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer old.deinit();
    var new = try @import("hwp5/text_source.zig").Source.open(a, result.bytes);
    defer new.deinit();
    try std.testing.expectEqual(@as(u32, 0x05000300), new.header.version().raw);
    try std.testing.expectEqualSlices(u8, old.header.raw[0..32], new.header.raw[0..32]);
    try std.testing.expectEqualSlices(u8, old.header.raw[36..], new.header.raw[36..]);
    try std.testing.expectEqual(old.section_count, new.section_count);
    var old_count: usize = 0;
    for (old.file.entries, 0..) |entry, index| {
        if (entry.kind == 0) continue;
        old_count += 1;
        const path = try old.file.rootRelativePath(index);
        const target = new.file.entries[(try new.file.findExact(path)) orelse return error.MissingCopiedEntry];
        try std.testing.expectEqual(entry.kind, target.kind);
        try std.testing.expectEqualStrings(entry.name, target.name);
        try std.testing.expectEqualDeep(entry.clsid, target.clsid);
        try std.testing.expectEqual(entry.state, target.state);
        try std.testing.expectEqual(entry.created, target.created);
        try std.testing.expectEqual(entry.modified, target.modified);
        if (entry.kind == 2 and !std.mem.eql(u8, path, "/FileHeader") and !std.mem.eql(u8, path, "/DocInfo") and !std.mem.startsWith(u8, path, "/BodyText/Section")) try std.testing.expectEqualSlices(u8, entry.content, target.content);
    }
    var new_count: usize = 0;
    for (new.file.entries) |entry| new_count += @intFromBool(entry.kind != 0);
    try std.testing.expectEqual(old_count, new_count);
}

test "experimental version copy reopens actual whole CFB with preserved non-target streams and header fields" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "charshape", "aligns", "multicolumns-in-common-controls", "pagedefs" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        const before = try a.dupe(u8, input);
        defer a.free(before);
        var result = try copy.prepareExperimental(a, input, options);
        defer result.deinit(a);
        try verify(a, input, result);
        try std.testing.expectEqualSlices(u8, before, input);
        var blocked = options;
        blocked.allow_unverified_copy = false;
        try std.testing.expectError(error.ExperimentalVersionCopyNotSelected, copy.prepareExperimental(a, input, blocked));
        blocked = options;
        blocked.max_file_bytes = result.bytes.len - 1;
        try std.testing.expectError(error.LimitExceeded, copy.prepareExperimental(a, input, blocked));
    }
}

fn shape(a: std.mem.Allocator, input: []const u8, id: u32) ![]u8 {
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    const info = try source.decodeDocInfo(a, 4_000_000);
    defer a.free(info);
    var records = @import("hwp5/record.zig").Iterator.init(info, .{});
    var ordinal: u32 = 0;
    while (try records.next()) |record| if (record.tag == 21) {
        if (ordinal == id) return a.dupe(u8, record.payload);
        ordinal += 1;
    };
    return error.InvalidCharacterShapeReference;
}

test "experimental version copy independently edits legacy underline color with native save history and reopen" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const edit = @import("hwp5/edit/style_preservation.zig");
    const command: edit.Command = .{ .set_character_properties = .{ .section = 0, .paragraph = 2, .start_unit = 6, .end_unit = 7, .properties = .{ .underline_color = 0x123456 } } };
    const original = try edit.Session.open(a, input);
    defer original.close();
    try std.testing.expectError(error.UnsupportedLegacyCharacterDecorations, original.apply(command));
    const untouched = try original.save(a, .{ .allow_stale_layout = true });
    defer a.free(untouched.bytes);
    try std.testing.expectEqualSlices(u8, input, untouched.bytes);
    var result = try copy.prepareExperimental(a, input, options);
    defer result.deinit(a);
    const session = try edit.Session.open(a, result.bytes);
    defer session.close();
    var history = try @import("hwp5/edit/editor_history.zig").History.init(a, session, 8, 4_000_000);
    defer history.deinit();
    const before = try shape(a, result.bytes, 9);
    defer a.free(before);
    try std.testing.expect(try history.apply(session, command));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const ranges = try session.characterRanges(a, 0, 2);
    defer a.free(ranges);
    var id: ?u32 = null;
    for (ranges) |range| if (range.start_unit <= 6 and range.end_unit > 6) {
        id = range.char_shape_id;
    };
    const actual = try shape(a, saved.bytes, id orelse return error.MissingCharacterRange);
    defer a.free(actual);
    const expected = try a.dupe(u8, before);
    defer a.free(expected);
    std.mem.writeInt(u32, expected[56..60], 0x563412, .little);
    try std.testing.expectEqualSlices(u8, expected, actual);
    try std.testing.expectEqualSlices(u8, before[70..74], actual[70..74]);
    try std.testing.expect(try history.undo(session));
    const restored = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(restored.bytes);
    try std.testing.expectEqualSlices(u8, result.bytes, restored.bytes);
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    try reopened.apply(command);
    const stable = try reopened.save(a, .{ .allow_stale_layout = true });
    defer a.free(stable.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, stable.bytes);
}

test "experimental version copy releases every failed allocation and refuses signed header claims" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const before = try a.dupe(u8, input);
    defer a.free(before);
    var expected = try copy.prepareExperimental(a, input, options);
    defer expected.deinit(a);
    try @import("testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: []const u8, wanted: []const u8) !void {
            var result = try copy.prepareExperimental(allocator, original, options);
            defer result.deinit(allocator);
            try std.testing.expectEqualSlices(u8, wanted, result.bytes);
            try std.testing.expect(!result.complete_document);
        }
    }.run, .{ input, expected.bytes });
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    var header = source.header;
    const Flag = @import("hwp5/file_header.zig").Flag;
    for ([_]Flag{ .digital_signature, .history, .signature_preview, .track_changes }) |flag| {
        std.mem.writeInt(u32, header.raw[36..40], source.header.flags() | (@as(u32, 1) << @backingInt(flag)), .little);
        const signed = try @import("cfb/stream_replace.zig").rebuildExact(a, &source.file, "/FileHeader", &header.raw, .{});
        defer a.free(signed);
        try std.testing.expectError(error.UnsupportedVersionCopyFeatures, copy.prepareExperimental(a, signed, options));
    }
    try std.testing.expectEqualSlices(u8, before, input);
}
