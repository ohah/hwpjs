//! Prepared regular Native cohort; no external implementation or expected corpus JSON.
const std = @import("std");
const a = std.testing.allocator;
const margins = @import("object_outer_margins.zig");
const Session = @import("style_preservation.zig").Session;
const History = @import("editor_history.zig").History;
const Source = @import("../text_source.zig").Source;
fn input(kind: margins.Kind) ![]u8 {
    const name = if (kind == .picture) "picture-resize.hwp" else "textbox.hwp";
    const path = try std.fmt.allocPrint(a, "apps/docs/docs/public/editor/fixtures/{s}", .{name});
    defer a.free(path);
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(8_000_000));
    errdefer a.free(bytes);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &digest, .{});
    const hex = std.fmt.bytesToHex(digest, .lower);
    try std.testing.expectEqualStrings(if (kind == .picture) "6b2010227e9d6cd41c242e0a29281eddb58f8f618c5df137c4ca3d518665dda2" else "905eeea44ec0a0bb59f1fc47d514cbc6c55207f588ec80813056d3a09e3219e7", &hex);
    return bytes;
}
fn observe(s: *const Session, kind: margins.Kind) !margins.Observation {
    if (kind == .picture) {
        const rows = try s.pictureSources(a, 0, .base73);
        defer a.free(rows);
        for (rows) |row| return s.objectOuterMargins(.{ .section = 0, .kind = kind, .node = @intCast(row.picture_node) });
    } else {
        const rows = try s.drawingSources(a, 0);
        defer a.free(rows);
        for (rows) |row| if (row.kind_id == @import("../body/control_rules.zig").id("$rec")) return s.objectOuterMargins(.{ .section = 0, .kind = kind, .node = @intCast(row.component_node) });
    }
    return error.MissingOuterMarginFixtureTarget;
}
fn marginOffset(raw: []const u8, version: @import("../version.zig").Version, instance: u32) !usize {
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    var offset: ?usize = null;
    for (tree.nodes) |node| {
        if (node.record.value != .control_header or node.record.value.control_header.id != @import("../body/control_rules.zig").drawing_id) continue;
        const common = try @import("../body/object_common.zig").parseControl(node.record.value.control_header);
        if (common.instance_id != instance) continue;
        if (offset != null) return error.AmbiguousOuterMarginFixture;
        const r = node.record.framing;
        offset = r.offset + r.raw.len - r.payload.len + 28;
    }
    return offset orelse error.MissingOuterMarginFixtureTarget;
}
fn outsideBytes(before: []const u8, after: []const u8, instance: u32, values: [4]i16) !void {
    var old = try Source.open(a, before);
    defer old.deinit();
    var next = try Source.open(a, after);
    defer next.deinit();
    const x = try old.decodeSection(a, 0);
    defer a.free(x);
    const y = try next.decodeSection(a, 0);
    defer a.free(y);
    const at = try marginOffset(x, old.header.version(), instance);
    try std.testing.expectEqual(at, try marginOffset(y, next.header.version(), instance));
    try std.testing.expectEqual(x.len, y.len);
    try std.testing.expectEqualSlices(u8, x[0..at], y[0..at]);
    try std.testing.expectEqualSlices(u8, x[at + 8 ..], y[at + 8 ..]);
    for (values, 0..) |value, i| try std.testing.expectEqual(value, std.mem.readInt(i16, y[at + i * 2 ..][0..2], .little));
    var old_count: usize = 0;
    var new_count: usize = 0;
    for (old.file.entries, 0..) |entry, index| {
        if (entry.kind != 2) continue;
        old_count += 1;
        const path = try old.file.rootRelativePath(index);
        if (!std.mem.eql(u8, path, "/BodyText/Section0")) try std.testing.expectEqualSlices(u8, entry.content, try next.file.readStream(a, path));
    }
    for (next.file.entries) |entry| if (entry.kind == 2) {
        new_count += 1;
    };
    try std.testing.expectEqual(old_count, new_count);
}
// Active-flow fixture is separate from raw preservation originals. Its builder
// removes caption ownership, selects explicit paragraph-relative floating wrap,
// and inserts adjacent ordinary body text through the existing Session writer.
fn floatingFixture(kind: margins.Kind, ordinal: u3) ![]u8 {
    const original = try input(kind);
    defer a.free(original);
    return @import("object_outer_margins_fixture.zig").prepare(a, original, kind, ordinal);
}
fn historyRoundTrip(kind: margins.Kind, values: [4]i16) !void {
    const bytes = try floatingFixture(kind, 0);
    defer a.free(bytes);
    const s = try Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    const baseline = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(baseline.bytes);
    const before = try observe(s, kind);
    try std.testing.expect(before.editable);
    try std.testing.expect(!before.treat_as_character);
    try std.testing.expectEqual(@as(u3, 0), before.wrap_ordinal);
    const reference = try s.currentSourceParagraphReference(0, before.target.paragraph);
    const text = try s.copyCurrentParagraphTextUtf16(a, 0, reference);
    defer a.free(text);
    const expected_body = try std.unicode.utf8ToUtf16LeAlloc(a, @import("object_outer_margins_fixture.zig").body_text);
    defer a.free(expected_body);
    try std.testing.expect(std.mem.indexOf(u8, text, std.mem.sliceAsBytes(expected_body)) != null);

    if (kind == .textbox) {
        try std.testing.expectEqual(@as(u3, 0), before.wrap_ordinal);
        try std.testing.expectEqual(margins.Table70Name.square, before.table70_name);
    }
    const request: margins.Request = .{ .target = before.target, .expected = before.margins, .margins = values };
    try std.testing.expect(try h.apply(s, .{ .edit_object_outer_margins = request }));
    try std.testing.expectEqual(@as(u32, 1), h.revision());
    const changed = try observe(s, kind);
    try std.testing.expectEqualSlices(i16, &values, &changed.margins);
    try std.testing.expectEqual(before.flags, changed.flags);
    try std.testing.expectEqual(before.target.anchor_unit, changed.target.anchor_unit);
    try std.testing.expectError(error.LayoutReflowRequired, s.save(a, .{}));
    const edited = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(edited.bytes);
    try outsideBytes(baseline.bytes, edited.bytes, before.target.instance_id, values);
    const reopened = try Session.open(a, edited.bytes);
    defer reopened.close();
    reopened.enableHistoryDelta();
    const restored = try observe(reopened, kind);
    try std.testing.expectEqualSlices(i16, &values, &restored.margins);
    try std.testing.expectEqual(before.flags, restored.flags);
    try std.testing.expect(try h.undo(s));
    const undo = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(undo.bytes);
    try std.testing.expectEqualSlices(u8, baseline.bytes, undo.bytes);
    try std.testing.expect(try h.redo(s));
    const redo = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(redo.bytes);
    try std.testing.expectEqualSlices(u8, edited.bytes, redo.bytes);
}
test "H5 outer margins captionless body direct floating Square picture history save reopen outside bytes" {
    try historyRoundTrip(.picture, .{ 750, 1500, 0, 0 });
}
test "H5 outer margins cached direct textbox explicit floating Square history save reopen outside bytes" {
    try historyRoundTrip(.textbox, .{ 750, 1500, 0, 0 });
}
test "H5 outer margins no-op preserves valid prior redo and old ticket cannot replay after undo" {
    const bytes = try floatingFixture(.picture, 0);
    defer a.free(bytes);
    const s = try Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    const before = try observe(s, .picture);
    const request: margins.Request = .{ .target = before.target, .expected = before.margins, .margins = .{ 1, 2, 3, 4 } };
    try std.testing.expect(try h.apply(s, .{ .edit_object_outer_margins = request }));
    try std.testing.expect(try h.undo(s));
    try std.testing.expectError(error.StaleMutationEpoch, h.apply(s, .{ .edit_object_outer_margins = request }));
    const now = try observe(s, .picture);
    try std.testing.expect(!try h.apply(s, .{ .edit_object_outer_margins = .{ .target = now.target, .expected = now.margins, .margins = now.margins } }));
    try std.testing.expectEqual(@as(u32, 0), h.revision());
    try std.testing.expect(try h.redo(s));
    const redone = try observe(s, .picture);
    try std.testing.expectEqualSlices(i16, &request.margins, &redone.margins);
}
test "H5 outer margins foreign ticket forged owner and mismatched expected reject atomically" {
    const bytes = try floatingFixture(.picture, 0);
    defer a.free(bytes);
    const s = try Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    const other = try Session.open(a, bytes);
    defer other.close();
    other.enableHistoryDelta();
    const before = try observe(s, .picture);
    const saved = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    var request: margins.Request = .{ .target = before.target, .expected = before.margins, .margins = .{ 1, 2, 3, 4 } };
    request.target.ticket = try other.historyTicket();
    try std.testing.expectError(error.StaleMutationEpoch, h.apply(s, .{ .edit_object_outer_margins = request }));
    request.target = before.target;
    request.target.control_node += 1;
    try std.testing.expectError(error.StaleOuterMarginTarget, h.apply(s, .{ .edit_object_outer_margins = request }));
    request.target = before.target;
    request.expected[0] = 99;
    try std.testing.expectError(error.StaleOuterMarginTarget, h.apply(s, .{ .edit_object_outer_margins = request }));
    const after = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(after.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, after.bytes);
    try std.testing.expectEqual(@as(u32, 0), h.revision());
}
test "H5 outer margins raw wrap ordinals are HWP5 observations and floating admission is explicit" {
    const bytes = try input(.picture);
    defer a.free(bytes);
    var source = try Source.open(a, bytes);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{raw});
    defer document.deinit(a);
    const s = try Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    const initial = try observe(s, .picture);
    const at = try marginOffset(raw, source.header.version(), initial.target.instance_id);
    const flags_at = at - 24;
    const draft = try a.dupe(u8, raw);
    defer a.free(draft);
    const original = std.mem.readInt(u32, raw[flags_at..][0..4], .little);
    for (0..8) |ordinal| for ([_]bool{ false, true }) |inline_object| {
        const flags = (original & ~(@as(u32, 1) | (@as(u32, 7) << 21))) | @as(u32, @intFromBool(inline_object)) | (@as(u32, @intCast(ordinal)) << 21);
        std.mem.writeInt(u32, draft[flags_at..][0..4], flags, .little);
        const observed = try margins.read(a, draft, source.header.version(), document.sections[0], initial.target.selector, initial.target.ticket, false);
        try std.testing.expectEqual(@as(u3, @intCast(ordinal)), observed.wrap_ordinal);
        try std.testing.expectEqual(margins.table70Name(@intCast(ordinal)), observed.table70_name);
        try std.testing.expectEqual(!inline_object and ordinal == 0, observed.editable);
    };
    // Signed storage boundary is a distinct byte-preservation check, not a visual positive.
    const floating_flags = original & ~(@as(u32, 1) | (@as(u32, 7) << 21));
    std.mem.writeInt(u32, draft[flags_at..][0..4], floating_flags, .little);
    const observed = try margins.read(a, draft, source.header.version(), document.sections[0], initial.target.selector, initial.target.ticket, false);
    const extreme: [4]i16 = .{ -32768, -1, 0, 32767 };
    const written = (try margins.write(a, draft, source.header.version(), document.sections[0], .{ .target = observed.target, .expected = observed.margins, .margins = extreme }, initial.target.ticket, false)) orelse return error.MissingMarginEdit;
    defer a.free(written);
    try std.testing.expectEqualSlices(u8, draft[0..at], written[0..at]);
    try std.testing.expectEqualSlices(u8, draft[at + 8 ..], written[at + 8 ..]);
    for (extreme, 0..) |value, i| try std.testing.expectEqual(value, std.mem.readInt(i16, written[at + i * 2 ..][0..2], .little));
}
test "H5 outer margins size protection is not general lock and readonly remains refusal" {
    const bytes = try input(.picture);
    defer a.free(bytes);
    var source = try Source.open(a, bytes);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{raw});
    defer document.deinit(a);
    const s = try Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    const initial = try observe(s, .picture);
    const at = try marginOffset(raw, source.header.version(), initial.target.instance_id);
    const draft = try a.dupe(u8, raw);
    defer a.free(draft);
    const flags = (std.mem.readInt(u32, draft[at - 24 ..][0..4], .little) & ~(@as(u32, 1) | (@as(u32, 3) << 3))) | (@as(u32, 2) << 3) | (@as(u32, 1) << 20);
    std.mem.writeInt(u32, draft[at - 24 ..][0..4], flags, .little);
    const unlocked = try margins.read(a, draft, source.header.version(), document.sections[0], initial.target.selector, initial.target.ticket, false);
    try std.testing.expect(unlocked.editable);
    const locked = try margins.read(a, draft, source.header.version(), document.sections[0], initial.target.selector, initial.target.ticket, true);
    try std.testing.expect(!locked.editable);
    const request: margins.Request = .{ .target = locked.target, .expected = locked.margins, .margins = .{ 1, 2, 3, 4 } };
    try std.testing.expectError(error.OuterMarginsReadOnly, margins.write(a, draft, source.header.version(), document.sections[0], request, initial.target.ticket, true));
}
test "H5 outer margins physical kind invalid section and unmanaged history refuse" {
    const bytes = try input(.picture);
    defer a.free(bytes);
    const s = try Session.open(a, bytes);
    defer s.close();
    try std.testing.expectError(error.HistoryDeltaCoverageIncomplete, s.objectOuterMargins(.{ .section = 0, .kind = .picture, .node = 11 }));
    s.enableHistoryDelta();
    const selected = try observe(s, .picture);
    try std.testing.expectError(error.InvalidOuterMarginTarget, s.objectOuterMargins(.{ .section = 0, .kind = .textbox, .node = selected.target.selector.node }));
    try std.testing.expectError(error.InvalidSection, s.objectOuterMargins(.{ .section = 99, .kind = .picture, .node = selected.target.selector.node }));
    var legacy = try History.init(a, s, 8, 8 * 1024 * 1024);
    defer legacy.deinit();
    try std.testing.expectError(error.HistoryProtocol2Required, legacy.apply(s, .{ .edit_object_outer_margins = .{ .target = selected.target, .expected = selected.margins, .margins = .{ 1, 2, 3, 4 } } }));
}

test "H5 outer margins approved raw3 remains valid source but not current exclusion edit" {
    const bytes = try input(.textbox);
    defer a.free(bytes);
    const s = try Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    const observed = try observe(s, .textbox);
    try std.testing.expectEqual(@as(u3, 3), observed.wrap_ordinal);
    try std.testing.expectEqual(margins.Table70Name.top_and_bottom, observed.table70_name);
    try std.testing.expectEqual(.no_exclusion, observed.current_renderer_margin_policy);
    try std.testing.expect(!observed.editable);
    try std.testing.expectEqualStrings("OuterMarginsNoCurrentExclusionEffect", observed.reason.?);
    const before = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(before.bytes);
    try std.testing.expectError(error.OuterMarginsReadOnly, h.apply(s, .{ .edit_object_outer_margins = .{ .target = observed.target, .expected = observed.margins, .margins = .{ 100, 200, 300, 400 } } }));
    const after = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(after.bytes);
    try std.testing.expectEqualSlices(u8, before.bytes, after.bytes);
    try std.testing.expectEqual(@as(u32, 0), h.revision());
}
