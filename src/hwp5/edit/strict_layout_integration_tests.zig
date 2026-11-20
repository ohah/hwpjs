//! Synthetic measurements through real factory/History/Session/CFB writers.
//! These tests require a separately approved Native slot. No OS font claim.
const std = @import("std");
const a = std.testing.allocator;
const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;
const layout = @import("strict_plain_layout.zig");
fn input() ![]u8 {
    return @import("../../new_document/root.zig").hwp5(a);
}
fn text() edit.Command {
    return .{ .splice_text = .{ .section = 0, .paragraph = 0, .start_unit = 16, .end_unit = 16, .utf8 = "한글 A" } };
}
fn measurements(s: *const layout.Snapshot) ![]layout.Line {
    var lines: std.ArrayList(layout.Line) = .empty;
    errdefer lines.deinit(a);
    var y: i32 = 0;
    for (s.wire.paragraphs, 0..) |p, pi| {
        var raw_at: usize = if (p.raw[0] == 2) 16 else 0;
        var start: u32 = 0;
        while (true) {
            var end = raw_at;
            while (end < p.raw.len - 1 and p.raw[end] != 10) : (end += 1) {}
            const advance: i32 = @intCast(@divTrunc(@as(i64, p.size) * p.spacing_percent + 50, 100));
            try lines.append(a, .{ .paragraph = @intCast(pi), .segment = .{ .start = start, .y = y, .height = p.size, .text_height = p.size, .baseline = @divTrunc(p.size * 3, 4), .spacing = advance - p.size, .x = 0, .width = s.wire.width, .flags = (1 << 17) | (1 << 18) | (if (lines.items.len == 0) @as(u32, 3) else 0) | (if (end == raw_at) @as(u32, 1 << 16) else 0) } });
            y += advance;
            if (end == p.raw.len - 1) break;
            raw_at = end + 1;
            start = @intCast(raw_at);
        }
    }
    return lines.toOwnedSlice(a);
}
fn checkCache(bytes: []const u8, expected: usize) !void {
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const body = try source.decodeSection(a, 0);
    defer a.free(body);
    var it = @import("../record.zig").Iterator.init(body, .{});
    var caches: usize = 0;
    while (try it.next()) |r| if (r.tag == 69) {
        caches += 1;
        try std.testing.expect(r.payload.len >= 36);
    };
    try std.testing.expectEqual(expected, caches);
}
test "strict save integration synthetic measured body strict save reopen retains history revision" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    _ = try h.apply(s, text());
    try std.testing.expectError(error.LayoutReflowRequired, s.save(a, .{}));
    var snapshot = try h.prepareStrictLayout(s, a);
    defer snapshot.deinit();
    const lines = try measurements(&snapshot);
    defer a.free(lines);
    const revision = h.revision();
    const saved = try h.saveStrictLayout(s, a, .{ .snapshot = &snapshot, .lines = lines });
    defer a.free(saved.bytes);
    try std.testing.expect(!saved.layout_requires_reflow);
    try std.testing.expectEqual(revision, h.revision());
    try checkCache(saved.bytes, 1);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    const read = try reopened.copyText(a, 0, 0);
    defer a.free(read);
    // copyText owns raw UTF-16LE, including section anchors and final CR.
    const expected_units = [_]u16{
        2,      0x6364, 0x7365, 0,      0,      0, 0, 2,
        2,      0x6c64, 0x636f, 0,      0,      0, 0, 2,
        0xd55c, 0xae00, 0x0020, 0x0041, 0x000d,
    };
    try std.testing.expectEqual(expected_units.len * @as(usize, 2), read.len);
    for (expected_units, 0..) |unit, index| {
        try std.testing.expectEqual(unit, std.mem.readInt(u16, read[index * 2 ..][0..2], .little));
    }
    const unchanged = try reopened.save(a, .{});
    defer a.free(unchanged.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, unchanged.bytes);
}
test "strict save integration late invalid measurement preserves live model history and guard" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    _ = try h.apply(s, text());
    var snapshot = try h.prepareStrictLayout(s, a);
    defer snapshot.deinit();
    const lines = try measurements(&snapshot);
    defer a.free(lines);
    lines[lines.len - 1].segment.baseline = -1;
    const before = try s.createCheckpoint(64 * 1024 * 1024);
    defer before.deinit();
    const revision = h.revision();
    try std.testing.expectError(error.InvalidStrictLayout, h.saveStrictLayout(s, a, .{ .snapshot = &snapshot, .lines = lines }));
    try std.testing.expect(try s.matchesCheckpoint(before));
    try std.testing.expectEqual(revision, h.revision());
    try std.testing.expectError(error.LayoutReflowRequired, s.save(a, .{}));
}
test "strict save integration edit undo redo invalidates measurement even same current bytes" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    _ = try h.apply(s, text());
    var snapshot = try h.prepareStrictLayout(s, a);
    defer snapshot.deinit();
    const lines = try measurements(&snapshot);
    defer a.free(lines);
    try std.testing.expect(try h.undo(s));
    try std.testing.expect(try h.redo(s));
    try std.testing.expectError(error.LayoutSourceChanged, h.saveStrictLayout(s, a, .{ .snapshot = &snapshot, .lines = lines }));
}
test "strict save integration structural split requires all current paragraph coverage" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    _ = try h.apply(s, text());
    _ = try h.apply(s, .{ .split_paragraph = .{ .section = 0, .paragraph = 0, .at_unit = 18 } });
    var snapshot = try h.prepareStrictLayout(s, a);
    defer snapshot.deinit();
    try std.testing.expectEqual(@as(usize, 2), snapshot.wire.paragraphs.len);
    const lines = try measurements(&snapshot);
    defer a.free(lines);
    try std.testing.expectError(error.IncompleteStrictLayout, h.saveStrictLayout(s, a, .{ .snapshot = &snapshot, .lines = lines[0..1] }));
    const saved = try h.saveStrictLayout(s, a, .{ .snapshot = &snapshot, .lines = lines });
    defer a.free(saved.bytes);
    try checkCache(saved.bytes, 2);
}
test "strict save integration explicit stale conflict and maximum output preserve source" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    _ = try h.apply(s, text());
    var snapshot = try h.prepareStrictLayout(s, a);
    defer snapshot.deinit();
    const lines = try measurements(&snapshot);
    defer a.free(lines);
    const request: layout.Request = .{ .snapshot = &snapshot, .lines = lines };
    try std.testing.expectError(error.InvalidSavePolicy, s.save(a, .{ .strict_layout = request, .allow_stale_layout = true }));
    try std.testing.expectError(error.LimitExceeded, s.save(a, .{ .strict_layout = request, .max_output_bytes = 1 }));
    try std.testing.expectError(error.LayoutReflowRequired, s.save(a, .{}));
}
test "strict save integration closed owner lease cannot authorize reused session address" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    s.enableHistoryDelta();
    var snapshot = try s.prepareStrictLayout(a);
    defer snapshot.deinit();
    s.close();
    try std.testing.expect(snapshot.lease.closed);
    const other = try edit.Session.open(a, bytes);
    defer other.close();
    other.enableHistoryDelta();
    const lines = try measurements(&snapshot);
    defer a.free(lines);
    try std.testing.expectError(error.LayoutSourceChanged, other.save(a, .{ .strict_layout = .{ .snapshot = &snapshot, .lines = lines } }));
}
test "strict save integration resource edit invalidates snapshot and remains strict by default" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    _ = try h.apply(s, text());
    var snapshot = try h.prepareStrictLayout(s, a);
    defer snapshot.deinit();
    const lines = try measurements(&snapshot);
    defer a.free(lines);
    _ = try h.apply(s, .{ .set_paragraph_alignment = .{ .section = 0, .paragraph = 0, .alignment = 2 } });
    try std.testing.expectError(error.LayoutSourceChanged, h.saveStrictLayout(s, a, .{ .snapshot = &snapshot, .lines = lines }));
    try std.testing.expectError(error.UnsupportedStrictParagraphStyle, h.prepareStrictLayout(s, a));
}
test "strict save integration allocation failure never partially publishes or changes history" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    _ = try h.apply(s, text());
    var snapshot = try h.prepareStrictLayout(s, a);
    defer snapshot.deinit();
    const lines = try measurements(&snapshot);
    defer a.free(lines);
    const before = try s.createCheckpoint(64 * 1024 * 1024);
    defer before.deinit();
    const revision = h.revision();
    // Bounded first-allocation failure, not a full OOM sweep.
    var failing = std.testing.FailingAllocator.init(a, .{ .fail_index = 0 });
    try std.testing.expectError(error.OutOfMemory, s.save(failing.allocator(), .{ .strict_layout = .{ .snapshot = &snapshot, .lines = lines } }));
    try std.testing.expect(try s.matchesCheckpoint(before));
    try std.testing.expectEqual(revision, h.revision());
}

test "strict save admission raw LF insertion rejects before source dirty or history revision" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    try std.testing.expectError(error.UnsupportedTextControl, h.apply(s, .{ .splice_text = .{ .section = 0, .paragraph = 0, .start_unit = 16, .end_unit = 16, .utf8 = "한글 A\n" } }));
    try std.testing.expectEqual(@as(u32, 0), h.revision());
    try std.testing.expectEqual(@as(usize, 1), h.revisionCount());
    try std.testing.expect(!h.stats().poisoned);
    const unchanged = try s.save(a, .{});
    defer a.free(unchanged.bytes);
    try std.testing.expectEqualSlices(u8, bytes, unchanged.bytes);
    try std.testing.expect(!unchanged.layout_requires_reflow);
}

test "strict save admission raw controls retain dirty guard checkpoint redo and measurement invalidation" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    _ = try h.apply(s, text());
    _ = try h.apply(s, .{ .splice_text = .{ .section = 0, .paragraph = 0, .start_unit = 16, .end_unit = 16, .utf8 = "B" } });
    try std.testing.expect(try h.undo(s));
    const revision = h.revision();
    const revisions = h.revisionCount();
    var snapshot = try h.prepareStrictLayout(s, a);
    defer snapshot.deinit();
    const lines = try measurements(&snapshot);
    defer a.free(lines);
    const before = try s.createCheckpoint(64 * 1024 * 1024);
    defer before.deinit();
    for ([_][]const u8{ "\n", "\t", "\r", "\x00", "\x02" }) |control| {
        try std.testing.expectError(error.UnsupportedTextControl, h.apply(s, .{ .splice_text = .{ .section = 0, .paragraph = 0, .start_unit = 16, .end_unit = 16, .utf8 = control } }));
        try std.testing.expect(try s.matchesCheckpoint(before));
        try std.testing.expectEqual(revision, h.revision());
        try std.testing.expectEqual(revisions, h.revisionCount());
        try std.testing.expect(!h.stats().poisoned);
        try std.testing.expectError(error.LayoutReflowRequired, s.save(a, .{}));
    }
    // Failed input leaves model/History intact but conservatively expires layout.
    try std.testing.expectError(error.LayoutSourceChanged, h.saveStrictLayout(s, a, .{ .snapshot = &snapshot, .lines = lines }));
    try std.testing.expect(try h.redo(s));
    try std.testing.expect(try h.undo(s));
    try std.testing.expect(try s.matchesCheckpoint(before));
}

fn visibleFonts(h: *History, s: *edit.Session, start: u32, end: u32) !void {
    const fonts = @import("../../model/character_fonts.zig");
    var commands: [fonts.languages.len]edit.Command = undefined;
    for (fonts.languages, 0..) |language, index| commands[index] = .{ .set_character_font_name = .{
        .section = 0,
        .paragraph = 0,
        .start_unit = start,
        .end_unit = end,
        .language = language,
        .name = "AppleGothic",
    } };
    try std.testing.expect(try h.applyBatch(s, &commands));
}

test "strict save integration visible font preserves three wire runs and reparse measurement owner" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    _ = try h.apply(s, text());
    const raw = try s.copyText(a, 0, 0);
    defer a.free(raw);
    try visibleFonts(&h, s, 16, 20);
    const after_font = try s.copyText(a, 0, 0);
    defer a.free(after_font);
    try std.testing.expectEqualSlices(u8, raw, after_font);
    const before_runs = try s.characterRanges(a, 0, 0);
    defer a.free(before_runs);
    try std.testing.expectEqual(@as(usize, 3), before_runs.len);
    for ([_]u32{ 0, 16, 20 }, [_]u32{ 16, 20, 21 }, before_runs) |start, end, run| {
        try std.testing.expectEqual(start, run.start_unit);
        try std.testing.expectEqual(end, run.end_unit);
    }
    try std.testing.expectEqual(before_runs[0].char_shape_id, before_runs[2].char_shape_id);
    try std.testing.expect(before_runs[1].char_shape_id != before_runs[0].char_shape_id);
    var snapshot = try h.prepareStrictLayout(s, a);
    defer snapshot.deinit();
    try std.testing.expectEqualStrings("AppleGothic", snapshot.wire.paragraphs[0].font);
    try std.testing.expectEqual(@as(i32, 1100), snapshot.wire.paragraphs[0].size);
    const lines = try measurements(&snapshot);
    defer a.free(lines);
    const revision = h.revision();
    const saved = try h.saveStrictLayout(s, a, .{ .snapshot = &snapshot, .lines = lines });
    defer a.free(saved.bytes);
    try std.testing.expect(!saved.layout_requires_reflow);
    try std.testing.expectEqual(revision, h.revision());
    try checkCache(saved.bytes, 1);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    reopened.enableHistoryDelta();
    var reopened_history = try History.initV2(a, reopened, .{});
    defer reopened_history.deinit();
    const reopened_raw = try reopened.copyText(a, 0, 0);
    defer a.free(reopened_raw);
    try std.testing.expectEqualSlices(u8, raw, reopened_raw);
    const reopened_runs = try reopened.characterRanges(a, 0, 0);
    defer a.free(reopened_runs);
    try std.testing.expectEqual(before_runs.len, reopened_runs.len);
    for (before_runs, reopened_runs) |before, after| {
        try std.testing.expectEqual(before.start_unit, after.start_unit);
        try std.testing.expectEqual(before.end_unit, after.end_unit);
        try std.testing.expectEqual(before.char_shape_id, after.char_shape_id);
    }
    // Read the output itself through the same source-owned style resolver.
    var reparsed = try reopened_history.prepareStrictLayout(reopened, a);
    defer reparsed.deinit();
    try std.testing.expectEqualStrings(snapshot.wire.paragraphs[0].font, reparsed.wire.paragraphs[0].font);
    try std.testing.expectEqual(snapshot.wire.paragraphs[0].size, reparsed.wire.paragraphs[0].size);
    try std.testing.expectEqual(snapshot.wire.paragraphs[0].bold, reparsed.wire.paragraphs[0].bold);
    try std.testing.expectEqual(snapshot.wire.paragraphs[0].italic, reparsed.wire.paragraphs[0].italic);
    const unchanged = try reopened.save(a, .{});
    defer a.free(unchanged.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, unchanged.bytes);
}

test "strict save integration true mixed visible styles still reject without live or history change" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    _ = try h.apply(s, text());
    try visibleFonts(&h, s, 16, 18);
    const raw = try s.copyText(a, 0, 0);
    defer a.free(raw);
    const revision = h.revision();
    try std.testing.expectError(error.UnsupportedStrictMixedVisibleStyle, h.prepareStrictLayout(s, a));
    const after = try s.copyText(a, 0, 0);
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, raw, after);
    try std.testing.expectEqual(revision, h.revision());
    try std.testing.expectError(error.LayoutReflowRequired, s.save(a, .{}));
}

test "strict save integration retained hidden metric mismatch remains guarded" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    _ = try h.apply(s, text());
    try visibleFonts(&h, s, 16, 20);
    _ = try h.apply(s, .{ .set_character_properties = .{
        .section = 0,
        .paragraph = 0,
        .start_unit = 16,
        .end_unit = 20,
        .properties = .{ .size = 1200 },
    } });
    try std.testing.expectError(error.UnsupportedStrictHiddenStyle, h.prepareStrictLayout(s, a));
    try std.testing.expectError(error.LayoutReflowRequired, s.save(a, .{}));
}
