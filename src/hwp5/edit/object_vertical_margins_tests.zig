//! Prepared only. Uses approved public raw and verified body fixture authoring.
const std = @import("std");
const a = std.testing.allocator;
const margins = @import("object_outer_margins.zig");
const Session = @import("style_preservation.zig").Session;
const History = @import("editor_history.zig").History;
const Source = @import("../text_source.zig").Source;

fn approved(name: []const u8) ![]u8 {
    const expected = if (std.mem.eql(u8, name, "picture-resize.hwp")) "6b2010227e9d6cd41c242e0a29281eddb58f8f618c5df137c4ca3d518665dda2" else if (std.mem.eql(u8, name, "textbox.hwp")) "905eeea44ec0a0bb59f1fc47d514cbc6c55207f588ec80813056d3a09e3219e7" else if (std.mem.eql(u8, name, "noori.hwp")) "b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f" else return error.UnapprovedFixture;
    const path = try std.fmt.allocPrint(a, "apps/docs/docs/public/editor/fixtures/{s}", .{name});
    defer a.free(path);
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(8_000_000));
    errdefer a.free(bytes);
    var sum: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &sum, .{});
    const hex = std.fmt.bytesToHex(sum, .lower);
    try std.testing.expectEqualStrings(expected, &hex);
    return bytes;
}
fn fixture(kind: margins.Kind, ordinal: u3) ![]u8 {
    const raw = try approved(if (kind == .picture) "picture-resize.hwp" else "textbox.hwp");
    defer a.free(raw);
    if (ordinal == 1) return @import("object_vertical_margins_fixture.zig").prepare(a, raw, kind);
    return @import("object_outer_margins_fixture.zig").prepare(a, raw, kind, ordinal);
}
fn selector(s: *const Session, kind: margins.Kind) !margins.Selector {
    if (kind == .picture) {
        const rows = try s.pictureSources(a, 0, .base73);
        defer a.free(rows);
        if (rows.len != 1) return error.AmbiguousFixture;
        return .{ .section = 0, .kind = kind, .node = @intCast(rows[0].picture_node) };
    }
    const rows = try s.drawingSources(a, 0);
    defer a.free(rows);
    var node: ?u32 = null;
    for (rows) |row| if (row.kind_id == @import("../body/control_rules.zig").id("$rec")) {
        if (node != null) return error.AmbiguousFixture;
        node = @intCast(row.component_node);
    };
    return .{ .section = 0, .kind = kind, .node = node orelse return error.MissingFixture };
}
fn controlOffset(raw: []const u8, version: @import("../version.zig").Version, node: u32) !usize {
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    if (node >= tree.nodes.len or tree.nodes[node].record.value != .control_header) return error.InvalidFixtureControl;
    const r = tree.nodes[node].record.framing;
    return r.offset + r.raw.len - r.payload.len;
}
fn outsideVerticalBytes(before: []const u8, after: []const u8, node: u32) !void {
    var old = try Source.open(a, before);
    defer old.deinit();
    var next = try Source.open(a, after);
    defer next.deinit();
    const x = try old.decodeSection(a, 0);
    defer a.free(x);
    const y = try next.decodeSection(a, 0);
    defer a.free(y);
    const at = try controlOffset(x, old.header.version(), node) + 32;
    try std.testing.expectEqual(at, try controlOffset(y, next.header.version(), node) + 32);
    try std.testing.expectEqual(x.len, y.len);
    try std.testing.expectEqualSlices(u8, x[0..at], y[0..at]);
    try std.testing.expectEqualSlices(u8, x[at + 4 ..], y[at + 4 ..]);
    try std.testing.expectEqual(@as(i16, 750), std.mem.readInt(i16, y[at..][0..2], .little));
    try std.testing.expectEqual(@as(i16, 1500), std.mem.readInt(i16, y[at + 2 ..][0..2], .little));
    var old_count: usize = 0;
    var new_count: usize = 0;
    for (old.file.entries, 0..) |entry, index| {
        if (entry.kind == 2) old_count += 1;
        if (entry.kind != 2) continue;
        const path = try old.file.rootRelativePath(index);
        if (!std.mem.eql(u8, path, "/BodyText/Section0")) try std.testing.expectEqualSlices(u8, entry.content, try next.file.readStream(a, path));
    }
    for (next.file.entries) |entry| if (entry.kind == 2) {
        new_count += 1;
    };
    try std.testing.expectEqual(old_count, new_count);
}
fn roundTrip(kind: margins.Kind) !void {
    const bytes = try fixture(kind, 1);
    defer a.free(bytes);
    const s = try Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    const baseline = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(baseline.bytes);
    const pick = try selector(s, kind);
    const old_scope = try s.objectOuterMargins(pick);
    try std.testing.expect(!old_scope.editable);
    const before = try s.objectVerticalOuterMargins(pick);
    try std.testing.expect(before.editable);
    try std.testing.expectEqual(margins.Table70Name.tight, before.table70_name);
    try std.testing.expectEqual(.compact_vertical_exclusion, before.current_renderer_margin_policy);
    const ref = try s.currentSourceParagraphReference(0, before.target.paragraph);
    const text = try s.copyCurrentParagraphTextUtf16(a, 0, ref);
    defer a.free(text);
    const body = try std.unicode.utf8ToUtf16LeAlloc(a, @import("object_outer_margins_fixture.zig").body_text);
    defer a.free(body);
    try std.testing.expect(std.mem.indexOf(u8, text, std.mem.sliceAsBytes(body)) != null);
    const request: margins.Request = .{ .target = before.target, .expected = before.margins, .margins = .{ before.margins[0], before.margins[1], 750, 1500 } };
    try std.testing.expect(try h.apply(s, .{ .edit_object_vertical_margins = request }));
    try std.testing.expectEqual(@as(u32, 1), h.revision());
    try std.testing.expectError(error.LayoutReflowRequired, s.save(a, .{}));
    const edited = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(edited.bytes);
    try outsideVerticalBytes(baseline.bytes, edited.bytes, before.target.control_node);
    const reopened = try Session.open(a, edited.bytes);
    defer reopened.close();
    reopened.enableHistoryDelta();
    const fresh = try reopened.objectVerticalOuterMargins(try selector(reopened, kind));
    try std.testing.expectEqualDeep(request.margins, fresh.margins);
    try std.testing.expectEqual(before.flags, fresh.flags);
    try std.testing.expect(try h.undo(s));
    const undo = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(undo.bytes);
    try std.testing.expectEqualSlices(u8, baseline.bytes, undo.bytes);
    const now = try s.objectVerticalOuterMargins(pick);
    try std.testing.expect(!try h.apply(s, .{ .edit_object_vertical_margins = .{ .target = now.target, .expected = now.margins, .margins = now.margins } }));
    try std.testing.expect(try h.redo(s));
    const redo = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(redo.bytes);
    try std.testing.expectEqualSlices(u8, edited.bytes, redo.bytes);
}
test "H5 observed vertical margins direct picture body history source save reopen" {
    try roundTrip(.picture);
}
test "H5 observed vertical margins direct textbox body history source save reopen" {
    try roundTrip(.textbox);
}
test "H5 observed vertical margins preserve Square v1 admission and reject horizontal change" {
    const square = try fixture(.picture, 0);
    defer a.free(square);
    const old = try Session.open(a, square);
    defer old.close();
    old.enableHistoryDelta();
    const pick = try selector(old, .picture);
    try std.testing.expect((try old.objectOuterMargins(pick)).editable);
    try std.testing.expect(!(try old.objectVerticalOuterMargins(pick)).editable);
    const bytes = try fixture(.picture, 1);
    defer a.free(bytes);
    const s = try Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    const v = try s.objectVerticalOuterMargins(try selector(s, .picture));
    try std.testing.expectError(error.VerticalMarginsHorizontalChangeForbidden, h.apply(s, .{ .edit_object_vertical_margins = .{ .target = v.target, .expected = v.margins, .margins = .{ v.margins[0] + 1, v.margins[1], 750, 1500 } } }));
    try std.testing.expectEqual(@as(u32, 0), h.revision());
}
test "H5 observed vertical margins readonly source refuses" {
    const bytes = try fixture(.picture, 1);
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
    const pick = try selector(s, .picture);
    const v = try margins.readObservedVertical(a, raw, source.header.version(), document.sections[0], pick, try s.historyTicket(), true);
    try std.testing.expect(!v.editable);
    try std.testing.expectError(error.OuterMarginsReadOnly, margins.writeObservedVertical(a, raw, source.header.version(), document.sections[0], .{ .target = v.target, .expected = v.margins, .margins = .{ v.margins[0], v.margins[1], 750, 1500 } }, v.target.ticket, true));
}
fn refusedOriginal(name: []const u8, kind: margins.Kind, caption: bool) !void {
    const bytes = try approved(name);
    defer a.free(bytes);
    var source = try Source.open(a, bytes);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const s = try Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    const pick = try selector(s, kind);
    const old = try s.objectOuterMargins(pick);
    const at = try controlOffset(raw, source.header.version(), old.target.control_node) + 4;
    const draft = try a.dupe(u8, raw);
    defer a.free(draft);
    const flags = std.mem.readInt(u32, draft[at..][0..4], .little);
    std.mem.writeInt(u32, draft[at..][0..4], (flags & ~(@as(u32, 7) << 21)) | (@as(u32, 1) << 21), .little);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{draft});
    defer document.deinit(a);
    const v = try margins.readObservedVertical(a, draft, source.header.version(), document.sections[0], pick, old.target.ticket, false);
    try std.testing.expect(!v.editable);
    try std.testing.expectEqualStrings(if (caption) "UnsupportedOuterMarginCaptionFlow" else "OuterMarginsInlineEffectUnverified", v.reason.?);
    try std.testing.expectError(error.OuterMarginsReadOnly, margins.writeObservedVertical(a, draft, source.header.version(), document.sections[0], .{ .target = v.target, .expected = v.margins, .margins = .{ v.margins[0], v.margins[1], 750, 1500 } }, old.target.ticket, false));
}
test "H5 observed vertical margins caption source refuses without removing caption" {
    try refusedOriginal("textbox.hwp", .textbox, true);
}
test "H5 observed vertical margins inline source refuses without floating normalization" {
    try refusedOriginal("picture-resize.hwp", .picture, false);
}
test "H5 observed vertical margins approved table-cell raw1 remains unsupported host" {
    const bytes = try approved("noori.hwp");
    defer a.free(bytes);
    const s = try Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    const rows = try s.pictureSources(a, 0, .base73);
    defer a.free(rows);
    for (rows) |row| if (row.owner_node == 226) {
        try std.testing.expectError(error.UnsupportedOuterMarginHost, s.objectVerticalOuterMargins(.{ .section = 0, .kind = .picture, .node = @intCast(row.picture_node) }));
        return;
    };
    return error.MissingApprovedNestedPicture;
}
test "H5 observed vertical margins stale full ticket does not publish" {
    const bytes = try fixture(.picture, 1);
    defer a.free(bytes);
    const s = try Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    var v = try s.objectVerticalOuterMargins(try selector(s, .picture));
    v.target.ticket.binding.owner += 1;
    try std.testing.expectError(error.StaleMutationEpoch, h.apply(s, .{ .edit_object_vertical_margins = .{ .target = v.target, .expected = v.margins, .margins = .{ v.margins[0], v.margins[1], 750, 1500 } } }));
    try std.testing.expectEqual(@as(u32, 0), h.revision());
}
test "H5 observed vertical margins rotated picture stays out of new cohort without narrowing Square" {
    const bytes = try fixture(.picture, 1);
    defer a.free(bytes);
    var source = try Source.open(a, bytes);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const s = try Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    const pick = try selector(s, .picture);
    const before = try s.objectVerticalOuterMargins(pick);
    var tree = try @import("source_tree.zig").parse(a, raw, source.header.version(), .{});
    defer tree.deinit(a);
    const r = tree.nodes[before.target.component_node].record.framing;
    const angle = r.offset + r.raw.len - r.payload.len + 40;
    const draft = try a.dupe(u8, raw);
    defer a.free(draft);
    std.mem.writeInt(i16, draft[angle..][0..2], 1, .little);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{draft});
    defer document.deinit(a);
    const v = try margins.readObservedVertical(a, draft, source.header.version(), document.sections[0], pick, before.target.ticket, false);
    try std.testing.expect(!v.editable);
    try std.testing.expectEqualStrings("UnsupportedOuterMarginTransform", v.reason.?);
    const flags_at = try controlOffset(draft, source.header.version(), before.target.control_node) + 4;
    const flags = std.mem.readInt(u32, draft[flags_at..][0..4], .little);
    std.mem.writeInt(u32, draft[flags_at..][0..4], flags & ~(@as(u32, 7) << 21), .little);
    try std.testing.expect((try margins.read(a, draft, source.header.version(), document.sections[0], pick, before.target.ticket, false)).editable);
}
