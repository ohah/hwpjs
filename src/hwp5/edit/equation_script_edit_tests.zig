//! Source-prepared Native regressions; synthetic/new own inputs only.
const std = @import("std");
const a = std.testing.allocator;
const Session = @import("style_preservation.zig").Session;
const History = @import("editor_history.zig").History;
const edit = @import("equation_script_edit.zig");
const raw_fixture = @embedFile("test_fixtures/own-equation-create-ad090cb4.hwp");
fn open() !*Session {
    const s = try Session.open(a, raw_fixture);
    s.enableHistoryDelta();
    return s;
}
fn witness(s: *Session) !edit.Witness {
    const sites = try s.equationSites(a, 0);
    defer a.free(sites);
    try std.testing.expectEqual(@as(usize, 1), sites.len);
    return s.observeEquationScriptEdit(a, .{ .section = 0, .equation_node = sites[0].equation_node, .layout = .with_font });
}
fn save(s: *Session) ![]u8 {
    return (try s.save(a, .{ .allow_stale_layout = true })).bytes;
}
fn sameSave(s: *Session, expected: []const u8) !void {
    const bytes = try save(s);
    defer a.free(bytes);
    try std.testing.expectEqualSlices(u8, expected, bytes);
}
fn section(bytes: []const u8) ![]u8 {
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    return source.decodeSection(a, 0);
}
fn script(bytes: []const u8, expected: []const u8) !void {
    const raw = try section(bytes);
    defer a.free(raw);
    const rows = try @import("equation_sources.zig").read(a, raw, .{ .raw = 0x05000300 }, .with_font, .{});
    defer a.free(rows);
    try std.testing.expectEqual(@as(usize, 1), rows.len);
    const utf16 = try std.unicode.utf8ToUtf16LeAlloc(a, expected);
    defer a.free(utf16);
    try std.testing.expectEqualSlices(u8, std.mem.sliceAsBytes(utf16), rows[0].script);
}
fn unselectedStreams(before: []const u8, after: []const u8) !void {
    const Cfb = @import("../../cfb/reader.zig").File;
    var left = try Cfb.open(a, before, .{});
    defer left.deinit();
    var right = try Cfb.open(a, after, .{});
    defer right.deinit();
    for (left.entries, 0..) |entry, index| {
        if (entry.kind != 2) continue;
        const path = try left.rootRelativePath(index);
        if (std.mem.eql(u8, path, "/BodyText/Section0")) continue;
        const l = try left.readStream(a, path);
        const r = try right.readStream(a, path);
        try std.testing.expectEqualSlices(u8, l, r);
    }
}
test "H5 equation script own ad090cb4 current read one history actual file reopen undo redo" {
    const hash = edit.digest(raw_fixture);
    try std.testing.expectEqualSlices(u8, &.{ 0xad, 0x09, 0x0c, 0xb4, 0x78, 0xe4, 0xe1, 0x60, 0xe1, 0x5d, 0x8d, 0x97, 0xe8, 0xc1, 0x4b, 0x07, 0xe0, 0xd9, 0x93, 0xfa, 0x53, 0x3a, 0x99, 0x3f, 0x48, 0xea, 0x5b, 0x55, 0x15, 0x8f, 0x58, 0xef }, &hash);
    const s = try open();
    defer s.close();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    const before = try save(s);
    defer a.free(before);
    try script(before, "x over y");
    const req: edit.Request = .{ .before = try witness(s), .script = "a^2 + 나😀" };
    try std.testing.expect(try h.apply(s, .{ .edit_equation_script = req }));
    try std.testing.expectEqual(@as(usize, 1), h.stats().undoCount);
    try std.testing.expectError(error.LayoutReflowRequired, s.save(a, .{}));
    const after = try save(s);
    defer a.free(after);
    try script(after, req.script);
    try unselectedStreams(before, after);
    var tmp = std.testing.tmpDir(.{});
    defer tmp.cleanup();
    try tmp.dir.writeFile(std.testing.io, .{ .sub_path = "edited.hwp", .data = after });
    const disk = try tmp.dir.readFileAlloc(std.testing.io, "edited.hwp", a, .limited(64 * 1024 * 1024));
    defer a.free(disk);
    const fresh = try Session.open(a, disk);
    defer fresh.close();
    try sameSave(fresh, after);
    try std.testing.expect(try h.undo(s));
    try sameSave(s, before);
    try std.testing.expect(try h.redo(s));
    try sameSave(s, after);
}
test "H5 equation script raw patch keeps all other records and complete metadata tail exact" {
    const s = try open();
    defer s.close();
    const w = try witness(s);
    const raw = try section(raw_fixture);
    defer a.free(raw);
    const changed = (try edit.patch(a, raw, .{ .raw = 0x05000300 }, w.site.equation_node, .with_font, w.payload_sha256, "z", 32 * 1024 * 1024)).?;
    defer a.free(changed);
    var before = @import("../record.zig").Iterator.init(raw, .{});
    var after = @import("../record.zig").Iterator.init(changed, .{});
    var index: usize = 0;
    while (try before.next()) |left| : (index += 1) {
        const right = (try after.next()).?;
        try std.testing.expectEqual(left.tag, right.tag);
        try std.testing.expectEqual(left.level, right.level);
        if (index != w.site.equation_node) {
            try std.testing.expectEqualSlices(u8, left.raw, right.raw);
        } else {
            const n = std.mem.readInt(u16, left.payload[4..6], .little);
            try std.testing.expectEqualSlices(u8, left.payload[0..4], right.payload[0..4]);
            try std.testing.expectEqualSlices(u8, left.payload[6 + 2 * @as(usize, n) ..], right.payload[8..]);
        }
    }
    try std.testing.expectEqual(null, try after.next());
}
test "H5 equation script stale forged owner payload and section reject atomically" {
    const s = try open();
    defer s.close();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    const req: edit.Request = .{ .before = try witness(s), .script = "p + q" };
    try std.testing.expect(try h.apply(s, .{ .edit_equation_script = req }));
    const after = try save(s);
    defer a.free(after);
    try std.testing.expectError(error.StaleMutationEpoch, h.apply(s, .{ .edit_equation_script = req }));
    try sameSave(s, after);
    var bad: edit.Request = .{ .before = try witness(s), .script = "z" };
    bad.before.site.control_node += 1;
    try std.testing.expectError(error.SourceBindingMismatch, h.apply(s, .{ .edit_equation_script = bad }));
    bad.before = try witness(s);
    bad.before.payload_sha256[0] ^= 1;
    try std.testing.expectError(error.SourceBindingMismatch, h.apply(s, .{ .edit_equation_script = bad }));
    bad.before = try witness(s);
    bad.before.selector.section = 100;
    try std.testing.expectError(error.InvalidSection, h.apply(s, .{ .edit_equation_script = bad }));
    try sameSave(s, after);
}
test "H5 equation script no-op and invalid encoding preserve genuine prior redo and saved bytes" {
    const s = try open();
    defer s.close();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    try std.testing.expect(try h.apply(s, .{ .edit_equation_script = .{ .before = try witness(s), .script = "p over q" } }));
    const edited = try save(s);
    defer a.free(edited);
    try std.testing.expect(try h.undo(s));
    const before = try save(s);
    defer a.free(before);
    const w = try witness(s);
    try std.testing.expect(!try h.apply(s, .{ .edit_equation_script = .{ .before = w, .script = "x over y" } }));
    const fresh = try witness(s);
    try std.testing.expectError(error.EmptyEquationScript, h.apply(s, .{ .edit_equation_script = .{ .before = fresh, .script = "" } }));
    try std.testing.expectError(error.InvalidEquationScriptEncoding, h.apply(s, .{ .edit_equation_script = .{ .before = try witness(s), .script = "\xff" } }));
    try std.testing.expectEqual(@as(usize, 1), h.stats().redoCount);
    try sameSave(s, before);
    try std.testing.expect(try h.redo(s));
    try sameSave(s, edited);
}
test "H5 equation script bounded raw patch exact output cap and plus one refuse" {
    const s = try open();
    defer s.close();
    const w = try witness(s);
    const raw = try section(raw_fixture);
    defer a.free(raw);
    const result = (try edit.patch(a, raw, .{ .raw = 0x05000300 }, w.site.equation_node, .with_font, w.payload_sha256, "x", 32 * 1024 * 1024)).?;
    defer a.free(result);
    const exact = (try edit.patch(a, raw, .{ .raw = 0x05000300 }, w.site.equation_node, .with_font, w.payload_sha256, "x", result.len)).?;
    defer a.free(exact);
    try std.testing.expectEqualSlices(u8, result, exact);
    try std.testing.expectError(error.LimitExceeded, edit.patch(a, raw, .{ .raw = 0x05000300 }, w.site.equation_node, .with_font, w.payload_sha256, "x", result.len - 1));
    const too_long = try a.alloc(u8, 65536);
    defer a.free(too_long);
    @memset(too_long, 'x');
    try std.testing.expectError(error.LimitExceeded, edit.patch(a, raw, .{ .raw = 0x05000300 }, w.site.equation_node, .with_font, w.payload_sha256, too_long, 32 * 1024 * 1024));
}

// Append one independently authored plain sibling. The approved equation
// paragraph is retained byte-for-byte; ordinary split guards are not bypassed.
fn fixtureWithPlainSibling() ![]u8 {
    var source = try @import("../text_source.zig").Source.open(a, raw_fixture);
    defer source.deinit();
    if (source.header.has(.compressed)) return error.TestFixtureMustBeUncompressed;
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var it = @import("../record.zig").Iterator.init(raw, .{});
    const first = (try it.next()).?;
    try std.testing.expectEqual(@as(u10, 66), first.tag);
    const header = try a.dupe(u8, first.payload);
    defer a.free(header);
    const Header = @import("../body/paragraph_header.zig").Header;
    Header.writeTextCounts(header, 1, 1, 0);
    std.mem.writeInt(u32, header[Header.control_mask_offset..][0..4], 0, .little);
    std.mem.writeInt(u32, header[Header.instance_id_offset..][0..4], 0xe011, .little);
    var section_bytes: std.ArrayList(u8) = .empty;
    defer section_bytes.deinit(a);
    try section_bytes.appendSlice(a, raw);
    const append = @import("../record_writer.zig").append;
    try append(a, &section_bytes, 66, 0, header, 32 * 1024 * 1024);
    try append(a, &section_bytes, 67, 1, &.{ 13, 0 }, 32 * 1024 * 1024);
    try append(a, &section_bytes, 68, 1, &@as([8]u8, @splat(0)), 32 * 1024 * 1024);
    const nodes = try source.file.toNodes(a);
    defer a.free(nodes);
    const index = try source.file.nodeIndex((try source.file.findExact("/BodyText/Section0")).?);
    nodes[index].content = section_bytes.items;
    return @import("../../cfb/writer.zig").write(a, nodes, .{});
}
test "H5 equation script pending generated paragraph and body text survive source basis edit" {
    const rejected = try open();
    defer rejected.close();
    try std.testing.expectError(error.UnsupportedStructuralControl, rejected.apply(.{ .split_paragraph = .{ .section = 0, .paragraph = 0, .at_unit = 24 } }));
    try sameSave(rejected, raw_fixture);
    const input = try fixtureWithPlainSibling();
    defer a.free(input);
    const s = try Session.open(a, input);
    defer s.close();
    s.enableHistoryDelta();
    // Only the independently authored plain paragraph is split. The new right
    // paragraph remains generated while the original equation is edited.
    try s.apply(.{ .split_paragraph = .{ .section = 0, .paragraph = 1, .at_unit = 0 } });
    try s.apply(.{ .splice_text = .{ .section = 0, .paragraph = 2, .start_unit = 0, .end_unit = 0, .utf8 = "TAIL" } });
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    const before = try save(s);
    defer a.free(before);
    try std.testing.expect(try h.apply(s, .{ .edit_equation_script = .{ .before = try witness(s), .script = "z over 긴분모" } }));
    const after = try save(s);
    defer a.free(after);
    const raw = try section(after);
    defer a.free(raw);
    try std.testing.expect(std.mem.indexOf(u8, raw, &.{ 'T', 0, 'A', 0, 'I', 0, 'L', 0 }) != null);
    try script(after, "z over 긴분모");
    try std.testing.expect(try h.undo(s));
    try sameSave(s, before);
    try std.testing.expect(try h.redo(s));
    try sameSave(s, after);
}
