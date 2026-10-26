const std = @import("std");
const f = @import("company_synthetic_fixture.zig");
const a = std.testing.allocator;
const edit = @import("style_preservation.zig");
const Session = edit.Session;
const History = @import("editor_history.zig").History;
fn saved(s: *Session) !@import("style_preservation.zig").Saved {
    return s.save(a, .{ .allow_stale_layout = true });
}
fn equal(s: *Session, b: []const u8) !void {
    const v = try saved(s);
    defer a.free(v.bytes);
    try std.testing.expectEqualSlices(u8, b, v.bytes);
}
fn assertFraming(bytes: []const u8) !void {
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, raw, f.version, .{});
    defer tree.deinit(a);
    var heads: usize = 0;
    for (tree.nodes, 0..) |node, index| {
        if (node.record.framing.tag != 66) continue;
        heads += 1;
        const h = node.record.value.header;
        try std.testing.expectEqual(@as(usize, 0), h.extra.len);
        try std.testing.expectEqual(@as(u10, 0), node.record.framing.level);
        try std.testing.expectEqual(@as(u10, 67), tree.nodes[index + 1].record.framing.tag);
        try std.testing.expectEqual(@as(u10, 68), tree.nodes[index + 2].record.framing.tag);
        const text = tree.nodes[index + 1].record.value.text;
        try text.validateCount(h);
        var mask: u32 = 0;
        var it = text.tokens();
        while (try it.next()) |token| {
            if (token.value == .control) {
                const code = token.value.control.code;
                if (code != 13) mask |= @as(u32, 1) << @intCast(code);
                if (code == 2 or code == 3 or code == 4) {
                    try std.testing.expectEqual(@as(usize, 16), token.raw.len);
                    try std.testing.expectEqual(code, std.mem.readInt(u16, token.raw[14..16], .little));
                }
            }
        }
        try std.testing.expectEqual(mask, h.control_mask);
        try std.testing.expectEqual(@as(u16, 1), h.char_shape_count);
    }
    try std.testing.expectEqual(@as(usize, 5), heads);
}
test "Company synthetic 01 deterministic materializer actual tag67 units masks and order" {
    for (std.enums.values(f.Case)) |case| {
        const b = try f.build(a, case);
        defer a.free(b);
        const c = try f.build(a, case);
        defer a.free(c);
        try std.testing.expectEqualSlices(u8, b, c);
        try assertFraming(b);
        if (std.process.Environ.getPosix(std.testing.environ, "HWPJS_COMPANY_SYNTHETIC_OUTPUT")) |dir| {
            const path = try std.fmt.allocPrint(a, "{s}/{s}.hwp", .{ dir, @tagName(case) });
            defer a.free(path);
            try std.Io.Dir.cwd().writeFile(std.testing.io, .{ .sub_path = path, .data = b });
        }
    }
}
fn positive(case: f.Case) !void {
    const b = try f.build(a, case);
    defer a.free(b);
    const s = try Session.open(a, b);
    defer s.close();
    var p = try s.textSourceProtection(a, 0);
    defer p.deinit(a);
    try std.testing.expectEqual(.retained_company, p.mode);
    try std.testing.expect(p.protected_paragraphs[2]);
    try std.testing.expect(!p.protected_paragraphs[1]);
    try std.testing.expect(!p.protected_paragraphs[3]);
    var history = try History.init(a, s, 8, 1_000_000);
    defer history.deinit();
    try std.testing.expect(try history.apply(s, .{ .set_character_properties = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 2, .properties = .{ .italic = true, .size = 1800 } } }));
    const format = try saved(s);
    defer a.free(format.bytes);
    try std.testing.expect(try history.apply(s, .{ .splice_text = .{ .section = 0, .paragraph = 3, .start_unit = 0, .end_unit = 0, .utf8 = "S" } }));
    const typed = try saved(s);
    defer a.free(typed.bytes);
    try std.testing.expect(try history.undo(s));
    try equal(s, format.bytes);
    try std.testing.expect(try history.undo(s));
    try equal(s, b);
    try std.testing.expect(try history.redo(s));
    try equal(s, format.bytes);
    try std.testing.expect(try history.redo(s));
    try equal(s, typed.bytes);
    const reopen = try Session.open(a, typed.bytes);
    defer reopen.close();
    try equal(reopen, typed.bytes);
}
test "Company synthetic 02 legal before after formatting edit save undo redo reopen" {
    try positive(.positive);
}
fn negative(case: f.Case, expected: anyerror) !void {
    const b = try f.build(a, case);
    defer a.free(b);
    const s = try Session.open(a, b);
    defer s.close();
    try std.testing.expectError(expected, s.textSourceProtection(a, 0));
    var history = try History.init(a, s, 8, 1_000_000);
    defer history.deinit();
    try std.testing.expectError(expected, history.apply(s, .{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "NO" } }));
    try std.testing.expectError(expected, history.apply(s, .{ .set_character_properties = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 1, .properties = .{ .italic = true } } }));
    try equal(s, b);
    try std.testing.expect(!try history.undo(s));
    try std.testing.expect(!try history.redo(s));
}
test "Company synthetic 03 actual orphan start rejects query text format atomically" {
    try negative(.orphan_start, error.MissingControlHeader);
}
test "Company synthetic 04 actual orphan end rejects query text format atomically" {
    try negative(.orphan_end, error.UnsupportedCrossParagraphField);
}
test "Company synthetic 05 duplicate instance ID rejects query text format atomically" {
    try negative(.duplicate_id, error.DuplicateFieldInstance);
}
test "Company synthetic 06 cross paragraph end rejects query text format atomically" {
    try negative(.cross_paragraph_end, error.UnsupportedRetainedResultControl);
}
test "Company synthetic 07 local hyperlink Company positive history" {
    try positive(.local_hyperlink);
}
test "Company synthetic 08 protected overlap empty and invalid resource preserve bytes" {
    const b = try f.build(a, .positive);
    defer a.free(b);
    const s = try Session.open(a, b);
    defer s.close();
    for ([_][2]u32{ .{ 0, 1 }, .{ 0, 16 }, .{ 8, 8 }, .{ 16, 16 } }) |range| try std.testing.expectError(error.ProtectedRetainedCompanyParagraph, s.apply(.{ .set_character_properties = .{ .section = 0, .paragraph = 2, .start_unit = range[0], .end_unit = range[1], .properties = .{ .italic = true } } }));
    try s.apply(.{ .set_character_properties = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .properties = .{ .italic = true } } });
    try std.testing.expectError(error.InvalidResourceReference, s.apply(.{ .set_character_format = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 1, .char_shape_id = std.math.maxInt(u32) } }));
    try equal(s, b);
}
test "Company synthetic 09 early middle late OOM rollback and retry" {
    const b = try f.build(a, .positive);
    defer a.free(b);
    const command: edit.Command = .{ .set_character_properties = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 2, .properties = .{ .italic = true, .size = 1800 } } };
    var measured = std.testing.FailingAllocator.init(a, .{});
    const baseline = try Session.open(measured.allocator(), b);
    defer baseline.close();
    const start = measured.alloc_index;
    try baseline.apply(command);
    const total = measured.alloc_index - start;
    const result = try saved(baseline);
    defer a.free(result.bytes);
    for ([_]usize{ 0, total / 2, total - 1 }) |index| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const s = try Session.open(failing.allocator(), b);
        defer s.close();
        const count = s.characterShapeCount();
        failing.fail_index = failing.alloc_index + index;
        try std.testing.expectError(error.OutOfMemory, s.apply(command));
        failing.fail_index = std.math.maxInt(usize);
        try equal(s, b);
        try std.testing.expectEqual(count, s.characterShapeCount());
        try s.apply(command);
        try equal(s, result.bytes);
    }
    std.debug.print("synthetic allocations {d}; early/middle/late rollback+retry\n", .{total});
}
