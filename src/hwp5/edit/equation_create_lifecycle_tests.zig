//! Synthetic own-input lifecycle: no external documents or expected JSON.
const std = @import("std");
const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;
const Request = @import("equation_create_request.zig").Request;
const a = std.testing.allocator;

fn request(session: *edit.Session, section: usize, paragraph: usize, unit: u32) !Request {
    const reference = try session.currentSourceParagraphReference(section, paragraph);
    if (reference != .source) return error.TestUnexpectedOwner;
    return .{ .target = .{ .section = section, .anchor = .{ .host = reference.source.host, .unit = unit } }, .script = "x^2 + y", .font_size = 1300, .box = .{ .width = 2400, .height = 1700 }, .color_rgb = 0x123456, .baseline = -3, .line_mode = true, .profile = .observed_eq60_hyhwpEQ_zero_word };
}
fn save(allocator: std.mem.Allocator, session: *edit.Session) ![]u8 {
    return (try session.save(allocator, .{ .allow_stale_layout = true })).bytes;
}
fn equalSave(session: *edit.Session, bytes: []const u8) !void {
    const current = try save(a, session);
    defer a.free(current);
    try std.testing.expectEqualSlices(u8, bytes, current);
}
fn generated(allocator: std.mem.Allocator, input: []const u8) !*edit.Session {
    const session = try edit.Session.open(allocator, input);
    errdefer session.close();
    try session.apply(.{ .split_paragraph = .{ .section = 0, .paragraph = 0, .at_unit = 16 } });
    try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "AB😀CD" } });
    return session;
}

// Independent framing/field offsets. This does not call the production EQEDIT
// parser or the production equation writer to manufacture expected bytes.
fn exactRaw(saved: []const u8, req: Request, expected: usize) !void {
    var source = try @import("../text_source.zig").Source.open(a, saved);
    defer source.deinit();
    const raw = try source.decodeSection(a, req.target.section);
    defer a.free(raw);
    var at: usize = 0;
    var count: usize = 0;
    var commons: usize = 0;
    while (at < raw.len) {
        if (raw.len - at < 4) return error.TestBadFraming;
        const h = std.mem.readInt(u32, raw[at..][0..4], .little);
        at += 4;
        var length: usize = h >> 20;
        if (length == 4095) {
            if (raw.len - at < 4) return error.TestBadFraming;
            length = std.mem.readInt(u32, raw[at..][0..4], .little);
            at += 4;
        }
        if (length > raw.len - at) return error.TestBadFraming;
        const payload = raw[at..][0..length];
        at += length;
        if (h & 1023 == 71 and length >= 44 and std.mem.eql(u8, payload[0..4], "deqe")) {
            try std.testing.expectEqual(req.box.width, std.mem.readInt(u32, payload[16..20], .little));
            try std.testing.expectEqual(req.box.height, std.mem.readInt(u32, payload[20..24], .little));
            try std.testing.expect(std.mem.readInt(u32, payload[36..40], .little) != 0);
            commons += 1;
        }
        if (h & 1023 != 88) continue;
        const script = try std.unicode.utf8ToUtf16LeAlloc(a, req.script);
        defer a.free(script);
        try std.testing.expectEqual(@as(u32, @intFromBool(req.line_mode)), std.mem.readInt(u32, payload[0..4], .little));
        try std.testing.expectEqual(script.len, std.mem.readInt(u16, payload[4..6], .little));
        try std.testing.expectEqualSlices(u8, std.mem.sliceAsBytes(script), payload[6..][0 .. script.len * 2]);
        const tail = payload[6 + script.len * 2 ..];
        try std.testing.expectEqual(req.font_size, std.mem.readInt(u32, tail[0..4], .little));
        try std.testing.expectEqual(@as(u32, 0x563412), std.mem.readInt(u32, tail[4..8], .little));
        try std.testing.expectEqual(req.baseline, std.mem.readInt(i16, tail[8..10], .little));
        try std.testing.expectEqual(@as(u16, 0), std.mem.readInt(u16, tail[10..12], .little));
        const version = std.unicode.utf8ToUtf16LeStringLiteral("Equation Version 60");
        const font = std.unicode.utf8ToUtf16LeStringLiteral("HYhwpEQ");
        try std.testing.expectEqual(@as(u16, 19), std.mem.readInt(u16, tail[12..14], .little));
        try std.testing.expectEqualSlices(u8, std.mem.sliceAsBytes(version[0..version.len]), tail[14..52]);
        try std.testing.expectEqual(@as(u16, 7), std.mem.readInt(u16, tail[52..54], .little));
        try std.testing.expectEqualSlices(u8, std.mem.sliceAsBytes(font[0..font.len]), tail[54..]);
        count += 1;
    }
    try std.testing.expectEqual(expected, count);
    try std.testing.expectEqual(expected, commons);
}
fn otherStreams(before: []const u8, after: []const u8, section: usize) !void {
    const cfb = @import("../../cfb/reader.zig");
    var left = try cfb.File.open(a, before, .{});
    defer left.deinit();
    var right = try cfb.File.open(a, after, .{});
    defer right.deinit();
    const selected = try std.fmt.allocPrint(a, "/BodyText/Section{d}", .{section});
    defer a.free(selected);
    for (left.entries, 0..) |entry, index| {
        if (entry.kind != 2) continue;
        const path = try left.rootRelativePath(index);
        if (std.mem.eql(u8, path, selected)) continue;
        const l = try left.readStream(a, path);
        const r = try right.readStream(a, path);
        try std.testing.expectEqualSlices(u8, l, r);
    }
}

test "HWP5 equation lifecycle original body single history commit save fresh reopen" {
    const input = try @import("../../new_document/root.zig").hwp5(a);
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    var history = try History.init(a, session, 8, 8_000_000);
    defer history.deinit();
    const req = try request(session, 0, 0, 16);
    try std.testing.expect(try history.apply(session, .{ .insert_equation = req }));
    try std.testing.expectEqual(@as(usize, 1), history.stack.undo.items.len);
    const after = try save(a, session);
    defer a.free(after);
    try exactRaw(after, req, 1);
    try otherStreams(input, after, 0);
    const reopened = try edit.Session.open(a, after);
    defer reopened.close();
    const sites = try reopened.equationSites(a, 0);
    defer a.free(sites);
    try std.testing.expectEqual(@as(usize, 1), sites.len);
    try std.testing.expectEqual(@as(u32, 16), sites[0].current_unit);
    try equalSave(reopened, after);
    try std.testing.expect(try history.undo(session));
    try equalSave(session, input);
    try std.testing.expect(try history.redo(session));
    try equalSave(session, after);
}

test "HWP5 equation lifecycle generated owner surrogate refusal and repeated insert order" {
    const input = try @import("../../new_document/root.zig").hwp5(a);
    defer a.free(input);
    const session = try generated(a, input);
    defer session.close();
    var history = try History.initV2(a, session, .{ .max_entries = 8 });
    defer history.deinit();
    const before = try save(a, session);
    defer a.free(before);
    const valid = try request(session, 0, 1, 2);
    var invalid = valid;
    invalid.target.anchor.unit = 3;
    try std.testing.expectError(error.SplitSurrogatePair, history.apply(session, .{ .insert_equation = invalid }));
    try equalSave(session, before);
    try std.testing.expect(try history.apply(session, .{ .insert_equation = valid }));
    const next = try request(session, 0, 1, 0);
    try std.testing.expect(try history.apply(session, .{ .insert_equation = next }));
    const after = try save(a, session);
    defer a.free(after);
    try exactRaw(after, next, 2);
    const sites = try session.equationSites(a, 0);
    defer a.free(sites);
    try std.testing.expectEqual(@as(usize, 2), sites.len);
    try std.testing.expectEqual(@as(u32, 0), sites[0].current_unit);
    try std.testing.expectEqual(@as(u32, 10), sites[1].current_unit);
    try std.testing.expect(try history.undo(session));
    try std.testing.expect(try history.undo(session));
    try equalSave(session, before);
    try std.testing.expect(try history.redo(session));
    try std.testing.expect(try history.redo(session));
    try equalSave(session, after);
}

const table_options: @import("created_table_records.zig").Options = .{
    .common = .{ .flags = 0x6a2211, .offset_y = 0, .offset_x = 0, .z_order = 0, .margins = @splat(0), .prevent_page_break = false, .description = "own table" },
    .table = .{ .page_break = 1, .repeat_header = false, .cell_spacing = 0, .margins = @splat(0) },
    .cell = .{ .layout = .observed8, .unknown = 0, .attributes = 0, .margins = @splat(0) },
};
test "HWP5 equation lifecycle preserves pending table content and rebases same host anchor" {
    const input = try @import("../../new_document/root.zig").hwp5(a);
    defer a.free(input);
    const session = try generated(a, input);
    defer session.close();
    var ids = try session.planTableIds(1);
    defer ids.deinit(a);
    var table = try @import("../../model/created_table.zig").create(a, ids.identity, ids.instance_id, try @import("../../model/table_creation_plan.zig").create(1, 1, 8000, 1600, 1), ids.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 0 }, 1);
    defer table.deinit(a);
    _ = try table.replaceText(a, 0, 0, "CELL", 100);
    try session.apply(.{ .stage_table = .{ .section = 0, .paragraph = 1, .unit = 4, .table = &table, .options = table_options } });
    const before = try save(a, session);
    defer a.free(before);
    var history = try History.init(a, session, 8, 8_000_000);
    defer history.deinit();
    const req = try request(session, 0, 1, 2);
    try std.testing.expect(try history.apply(session, .{ .insert_equation = req }));
    try std.testing.expectEqual(@as(usize, 1), try session.pendingTableCount(0));
    const rows = try session.createdTables(a, 0);
    defer @import("created_table_snapshot.zig").deinit(a, rows);
    try std.testing.expectEqual(@as(u32, 12), rows[0].table.anchor_unit);
    try std.testing.expectEqualSlices(u8, "CELL", rows[0].table.cells[0].text);
    const after = try save(a, session);
    defer a.free(after);
    try exactRaw(after, req, 1);
    const reopened = try edit.Session.open(a, after);
    defer reopened.close();
    const anchors = try reopened.tableAnchors(a, 0);
    defer a.free(anchors);
    try std.testing.expectEqual(@as(usize, 1), anchors.len);
    try std.testing.expect(try history.undo(session));
    try equalSave(session, before);
    try std.testing.expect(try history.redo(session));
    try equalSave(session, after);
}

test "HWP5 equation lifecycle malformed request and prefix refusal retain existing redo" {
    const input = try @import("../../new_document/root.zig").hwp5(a);
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    var history = try History.init(a, session, 8, 8_000_000);
    defer history.deinit();
    const req = try request(session, 0, 0, 16);
    try std.testing.expect(try history.apply(session, .{ .insert_equation = req }));
    const after = try save(a, session);
    defer a.free(after);
    try std.testing.expect(try history.undo(session));
    var bad = req;
    bad.script = "";
    try std.testing.expectError(error.EmptyEquationScript, history.apply(session, .{ .insert_equation = bad }));
    bad = req;
    bad.target.anchor.unit = 0;
    try std.testing.expectError(error.InvalidEquationCaret, history.apply(session, .{ .insert_equation = bad }));
    try std.testing.expectEqual(@as(usize, 1), history.stack.redo.items.len);
    try equalSave(session, input);
    try std.testing.expect(try history.redo(session));
    try equalSave(session, after);
}

fn twoSections() ![]u8 {
    const input = try @import("../../new_document/root.zig").hwp5(a);
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const info = try source.decodeDocInfo(a, 4_000_000);
    defer a.free(info);
    // Own generated document is uncompressed and begins with tag16 length26.
    try std.testing.expectEqual(@as(u32, 16), std.mem.readInt(u32, info[0..4], .little) & 1023);
    std.mem.writeInt(u16, info[4..6], 2, .little);
    const old = try source.file.toNodes(a);
    defer a.free(old);
    const nodes = try a.alloc(@import("../../cfb/writer.zig").Node, old.len + 1);
    defer a.free(nodes);
    @memcpy(nodes[0..old.len], old);
    const doc_node = try source.file.nodeIndex((try source.file.findExact("/DocInfo")).?);
    const body_node = try source.file.nodeIndex((try source.file.findExact("/BodyText")).?);
    const section_node = try source.file.nodeIndex((try source.file.findExact("/BodyText/Section0")).?);
    nodes[doc_node].content = info;
    nodes[old.len] = .{ .name = "Section1", .parent = @intCast(body_node), .content = nodes[section_node].content };
    return @import("../../cfb/writer.zig").write(a, nodes, .{});
}
fn equationId(saved: []const u8, section: usize) !u32 {
    var source = try @import("../text_source.zig").Source.open(a, saved);
    defer source.deinit();
    const raw = try source.decodeSection(a, section);
    defer a.free(raw);
    var it = @import("../record.zig").Iterator.init(raw, .{});
    while (try it.next()) |record| if (record.tag == 71 and std.mem.eql(u8, record.payload[0..4], "deqe")) {
        return std.mem.readInt(u32, record.payload[36..40], .little);
    };
    return error.TestMissingEquation;
}
test "HWP5 equation lifecycle nonfirst section reserves IDs across current source" {
    const input = try twoSections();
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    var history = try History.init(a, session, 8, 8_000_000);
    defer history.deinit();
    const first = try request(session, 0, 0, 16);
    try std.testing.expect(try history.apply(session, .{ .insert_equation = first }));
    const middle = try save(a, session);
    defer a.free(middle);
    const second = try request(session, 1, 0, 16);
    try std.testing.expect(try history.apply(session, .{ .insert_equation = second }));
    const after = try save(a, session);
    defer a.free(after);
    try exactRaw(after, first, 1);
    try exactRaw(after, second, 1);
    try std.testing.expect(try equationId(after, 0) != try equationId(after, 1));
    try otherStreams(middle, after, 1);
    try std.testing.expect(try history.undo(session));
    try equalSave(session, middle);
    try std.testing.expect(try history.redo(session));
    try equalSave(session, after);
}

test "HWP5 equation lifecycle implicit CR source and malformed explicit empty text differ" {
    const version: @import("../version.zig").Version = .{ .raw = 0x05000107 };
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    var header: [22]u8 = @splat(0);
    std.mem.writeInt(u32, header[0..4], 1, .little);
    std.mem.writeInt(u16, header[12..14], 1, .little);
    const append = @import("../record_writer.zig").append;
    try append(a, &out, 66, 0, &header, 4096);
    try append(a, &out, 68, 1, &@as([8]u8, @splat(0)), 4096);
    var doc = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{out.items});
    defer doc.deinit(a);
    const req: Request = .{ .target = .{ .section = 0, .anchor = .{ .host = .{ .original_node = 0 }, .unit = 0 } }, .script = "x", .font_size = 1000, .box = .{ .width = 2000, .height = 1000 }, .color_rgb = 0, .baseline = 0, .line_mode = false, .profile = .observed_eq60_hyhwpEQ_zero_word };
    var changed = try @import("equation_create_section.zig").write(a, out.items, version, doc.sections[0], 0, req, 1, 1, 4096);
    defer changed.deinit(a);
    var projected = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{changed.raw});
    defer projected.deinit(a);
    try std.testing.expectEqual(@as(u32, 9), projected.sections[0].paragraphs[0].declared_units);
    try append(a, &out, 67, 1, &.{}, 4096);
    try std.testing.expectError(error.ParagraphTextCountMismatch, @import("equation_create_section.zig").write(a, out.items, version, doc.sections[0], 0, req, 1, 1, 4096));
}

fn allocationCase(allocator: std.mem.Allocator, input: []const u8, calls: *usize) !void {
    calls.* += 1;
    const session = try generated(allocator, input);
    defer session.close();
    var history = try History.init(allocator, session, 4, 8_000_000);
    defer history.deinit();
    // Prepare a genuine redo entry before the insertion under test.
    try std.testing.expect(try history.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "Q" } }));
    try std.testing.expect(try history.undo(session));
    const before = try save(a, session);
    defer a.free(before);
    const req = try request(session, 0, 1, 2);
    _ = history.apply(session, .{ .insert_equation = req }) catch |err| {
        try equalSave(session, before);
        try std.testing.expectEqual(@as(usize, 0), history.stack.undo.items.len);
        try std.testing.expectEqual(@as(usize, 1), history.stack.redo.items.len);
        return err;
    };
    const after = try save(a, session);
    defer a.free(after);
    try exactRaw(after, req, 1);
    try std.testing.expect(try history.undo(session));
    try equalSave(session, before);
    try std.testing.expect(try history.redo(session));
    try equalSave(session, after);
}
test "HWP5 equation managed OOM whole Session transaction retains prior redo" {
    const input = try @import("../../new_document/root.zig").hwp5(a);
    defer a.free(input);
    var calls: usize = 0;
    try @import("../../testing/allocation_failures.zig").check(allocationCase, .{ input, &calls });
    try std.testing.expect(calls >= @import("../../testing/allocation_failures.zig").success_controls);
    std.debug.print("H5_EQ_LIFECYCLE_OOM callbacks={d}\n", .{calls});
}
