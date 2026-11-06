//! Original allowed Noori only. Synthetic shared-resource controls live separately.
const std = @import("std");
const a = std.testing.allocator;
const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;
const Source = @import("../text_source.zig").Source;
const p = @import("../../model/border_fill_patch.zig");
const fills = @import("border_fill_sources.zig");
const selected_table = 200;
const selected_list = 201;
fn fixture() ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwp", a, .limited(8_000_000));
}
fn command(mask: u8, style: p.Style, width: u16, color: u32) edit.Command {
    return .{ .set_cell_border = .{ .section = 0, .table_node = selected_table, .list_node = selected_list, .edges = mask, .style = style, .width_hundredth_mm = width, .color = color } };
}
fn background(color: u32) edit.Command {
    return .{ .set_cell_background = .{ .section = 0, .table_node = selected_table, .list_node = selected_list, .color = color } };
}
fn historyFor(session: *edit.Session, mode: u8) !History {
    return historyForIn(a, session, mode);
}
fn historyForIn(allocator: std.mem.Allocator, session: *edit.Session, mode: u8) !History {
    if (mode == 2) session.enableHistoryDelta();
    return if (mode == 0) try History.init(allocator, session, 16, 8_000_000) else try History.initV2(allocator, session, .{ .max_entries = 16, .max_checkpoint_bytes = 8_000_000, .max_retained_bytes = 64_000_000 });
}
fn currentId(session: *const edit.Session) !u16 {
    const rows = try session.cellLayoutSources(a, 0);
    defer a.free(rows);
    for (rows) |row| if (row.table_record_node == selected_table and row.list_node == selected_list) return row.border_fill_id;
    return error.MissingNooriOriginalCell;
}
fn checkLive(session: *const edit.Session, expected: p.Patch) !u16 {
    const id = try currentId(session);
    var info = try session.formattingSource(a);
    defer info.deinit();
    const payload = try @import("border_fill_docinfo_patch.zig").resource(info.bytes, id);
    const observed = try @import("border_fill_payload_patch.zig").observe(payload);
    try std.testing.expect(p.matches(observed, expected));
    // Public batch query must observe the SAME effective resource as single lookup.
    const resources = try session.borderFillSources(a);
    defer fills.deinit(a, resources);
    for (expected.border.edges, 0..) |edge, i| if (edge) |v| {
        if (v.style) |style| try std.testing.expectEqual(try p.hwp5Style(style), resources[id - 1].borders[i].kind);
        if (v.width_hundredth_mm) |width| try std.testing.expectEqual(try p.widthCode(width), resources[id - 1].borders[i].width);
        if (v.color) |color| try std.testing.expectEqual(wire(color), resources[id - 1].borders[i].color);
    };
    return id;
}
fn wire(rgb: u32) u32 {
    return ((rgb >> 16) & 255) | (rgb & 0xff00) | ((rgb & 255) << 16);
}
fn expectedPatch(border: edit.Command, bg: ?u32) !p.Patch {
    var patch = try @import("cell_border_values.zig").toPatch(border.set_cell_border);
    if (bg) |color| patch.background = .{ .solid = .{ .color = color, .hatch_color = color } };
    return patch;
}
/// Independent byte oracle: existing streams/records exactly preserved, only one
/// cell ref and one appended resource plus its ID count may differ.
fn savedOracle(original: []const u8, saved: []const u8, patch: p.Patch, id: u16) !void {
    var old = try Source.open(a, original);
    defer old.deinit();
    var next = try Source.open(a, saved);
    defer next.deinit();
    try std.testing.expectEqual(old.file.entries.len, next.file.entries.len);
    for (old.file.entries, 0..) |entry, index| {
        if (entry.kind != 2) continue;
        const path = try old.file.rootRelativePath(index);
        const content = try next.file.readStream(a, path);
        if (!std.mem.eql(u8, path, "/DocInfo") and !std.mem.eql(u8, path, "/BodyText/Section0")) try std.testing.expectEqualSlices(u8, entry.content, content);
    }
    const raw = try old.decodeSection(a, 0);
    defer a.free(raw);
    const section = try next.decodeSection(a, 0);
    defer a.free(section);
    const expected_section = try a.dupe(u8, raw);
    defer a.free(expected_section);
    var records = @import("../record.zig").Iterator.init(raw, .{});
    var node: u32 = 0;
    var found = false;
    while (try records.next()) |record| : (node += 1) if (node == selected_list) {
        try std.testing.expectEqual(@as(u16, 72), record.tag);
        const at = record.offset + record.raw.len - record.payload.len + 32;
        try std.testing.expectEqual(@as(u16, 2), std.mem.readInt(u16, raw[at..][0..2], .little));
        std.mem.writeInt(u16, expected_section[at..][0..2], id, .little);
        found = true;
    };
    try std.testing.expect(found);
    try std.testing.expectEqualSlices(u8, expected_section, section);
    const info = try old.decodeDocInfo(a, 32_000_000);
    defer a.free(info);
    const next_info = try next.decodeDocInfo(a, 32_000_000);
    defer a.free(next_info);
    const source = try @import("border_fill_docinfo_patch.zig").resource(info, 2);
    try std.testing.expectEqual(@as(u32, 0), std.mem.readInt(u32, source[32..36], .little));
    const expected = try a.alloc(u8, source.len + @as(usize, if (patch.background != null) 12 else 0));
    defer a.free(expected);
    if (patch.background) |bg| {
        @memcpy(expected[0..32], source[0..32]);
        std.mem.writeInt(u32, expected[32..36], 1, .little);
        std.mem.writeInt(u32, expected[36..40], wire(bg.solid.color), .little);
        std.mem.writeInt(u32, expected[40..44], wire(bg.solid.color), .little);
        std.mem.writeInt(i32, expected[44..48], -1, .little);
        @memcpy(expected[48..], source[36..]);
    } else @memcpy(expected, source);
    for (patch.border.edges, 0..) |edge, i| if (edge) |v| {
        const at = 2 + i * 6;
        // Oracle uses explicit validated contract codes; no product patch writer.
        if (v.style) |style| expected[at] = switch (style) {
            .NONE => 0,
            .SOLID => 1,
            .DOUBLE_SLIM => 8,
            else => return error.UnexpectedTestStyle,
        };
        if (v.width_hundredth_mm) |width| {
            var matched = false;
            for ([_]u16{ 10, 12, 15, 20, 25, 30, 40, 50, 60, 70, 100, 150, 200, 300, 400, 500 }, 0..) |w, code| if (width == w) {
                expected[at + 1] = @intCast(code);
                matched = true;
            };
            try std.testing.expect(matched);
        }
        if (v.color) |color| std.mem.writeInt(u32, expected[at + 2 ..][0..4], wire(color), .little);
    };
    var before = @import("../record.zig").Iterator.init(info, .{});
    var after = @import("../record.zig").Iterator.init(next_info, .{});
    var count: u16 = 0;
    var inserted = false;
    while (try before.next()) |record| {
        const n = (try after.next()) orelse return error.MissingOldRecord;
        try std.testing.expectEqual(record.tag, n.tag);
        if (record.tag == 17) {
            const mapping = try a.dupe(u8, record.payload);
            defer a.free(mapping);
            const old_count = std.mem.readInt(i32, mapping[32..36], .little);
            std.mem.writeInt(i32, mapping[32..36], old_count + 1, .little);
            try std.testing.expectEqualSlices(u8, mapping, n.payload);
        } else try std.testing.expectEqualSlices(u8, record.raw, n.raw);
        if (record.tag == 20) {
            count += 1;
            if (count + 1 == id) {
                const clone = (try after.next()) orelse return error.MissingClone;
                try std.testing.expectEqual(@as(u16, 20), clone.tag);
                try std.testing.expectEqualSlices(u8, expected, clone.payload);
                inserted = true;
            }
        }
    }
    try std.testing.expect(inserted);
    try std.testing.expect((try after.next()) == null);
}

test "cell border HWP5 ORIGINAL Noori mixed orders V1 V2 managed live save reopen undo redo" {
    const bytes = try fixture();
    defer a.free(bytes);
    for ([_]u8{ 0, 1, 2 }) |mode| for ([_]bool{ false, true }) |bg_first| {
        const session = try edit.Session.open(a, bytes);
        defer session.close();
        const old_rows = try session.cellLayoutSources(a, 0);
        defer a.free(old_rows);
        var users: usize = 0;
        for (old_rows) |row| if (row.border_fill_id == 2) {
            users += 1;
        };
        try std.testing.expectEqual(@as(usize, 24), users);
        var history = try historyFor(session, mode);
        defer history.deinit();
        const border = command(5, .DOUBLE_SLIM, 25, 0);
        const bg = background(0x123456);
        try std.testing.expect(try history.apply(session, if (bg_first) bg else border));
        try std.testing.expect(try history.apply(session, if (bg_first) border else bg));
        const expected = try expectedPatch(border, 0x123456);
        const id = try checkLive(session, expected); // Before save, same plan as current queries.
        try std.testing.expect(id != 2);
        const rows = try session.cellLayoutSources(a, 0);
        defer a.free(rows);
        for (old_rows, rows) |old, row| {
            if (old.table_record_node == selected_table and old.list_node == selected_list) try std.testing.expectEqual(id, row.border_fill_id) else try std.testing.expectEqualDeep(old, row);
        }
        try std.testing.expect(!try history.apply(session, border));
        const saved = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(saved.bytes);
        try savedOracle(bytes, saved.bytes, expected, id);
        const reopened = try edit.Session.open(a, saved.bytes);
        defer reopened.close();
        try std.testing.expectEqual(id, try checkLive(reopened, expected));
        try std.testing.expect(try history.undo(session));
        // Same-current request after undo must retain the pending redo branch.
        try std.testing.expect(!try history.apply(session, if (bg_first) bg else border));
        try std.testing.expect(try history.redo(session));
        _ = try checkLive(session, expected);
        try std.testing.expect(try history.undo(session));
        try std.testing.expect(try history.undo(session));
        const restored = try session.save(a, .{});
        defer a.free(restored.bytes);
        try std.testing.expectEqualSlices(u8, bytes, restored.bytes);
        try std.testing.expect(try history.redo(session));
        try std.testing.expect(try history.redo(session));
        const redone = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(redone.bytes);
        try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
    };
}

test "cell border HWP5 ORIGINAL Noori individual multi-edge clear NONE and failed batch rollback" {
    const bytes = try fixture();
    defer a.free(bytes);
    for ([_]u8{ 0, 1, 2 }) |mode| for ([_]u8{ 1, 2, 4, 8, 15 }) |mask| {
        const session = try edit.Session.open(a, bytes);
        defer session.close();
        var history = try historyFor(session, mode);
        defer history.deinit();
        const border = command(mask, .SOLID, 40, 0x123456);
        try std.testing.expect(try history.apply(session, background(0)));
        try std.testing.expect(try history.apply(session, border));
        const expected = try expectedPatch(border, 0);
        const saved = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(saved.bytes);
        try savedOracle(bytes, saved.bytes, expected, try checkLive(session, expected));
        const revision = history.revision();
        try std.testing.expectError(error.InvalidCellBorderEdges, history.applyBatch(session, &.{ command(mask, .DOUBLE_SLIM, 25, 0), command(0, .SOLID, 10, 0) }));
        try std.testing.expectEqual(revision, history.revision());
        _ = try checkLive(session, expected);
        // NONE still writes the explicitly selected width and black color.
        const clear = command(mask, .NONE, 40, 0);
        try std.testing.expect(try history.apply(session, clear));
        const cleared = try expectedPatch(clear, 0);
        _ = try checkLive(session, cleared);
        const clear_saved = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(clear_saved.bytes);
        try savedOracle(bytes, clear_saved.bytes, cleared, try currentId(session));
        try std.testing.expect(try history.undo(session));
        _ = try checkLive(session, expected);
        try std.testing.expect(try history.redo(session));
        _ = try checkLive(session, cleared);
    };
}

test "cell border HWP5 ORIGINAL Noori V1 V2 early middle late OOM restores background and redo" {
    const bytes = try fixture();
    defer a.free(bytes);
    for ([_]u8{ 0, 1, 2 }) |mode| {
        const border = command(15, .DOUBLE_SLIM, 25, 0);
        var measured = std.testing.FailingAllocator.init(a, .{});
        const baseline = try edit.Session.open(measured.allocator(), bytes);
        defer baseline.close();
        var baseline_history = try historyForIn(measured.allocator(), baseline, mode);
        defer baseline_history.deinit();
        try std.testing.expect(try baseline_history.apply(baseline, background(0x123456)));
        try std.testing.expect(try baseline_history.apply(baseline, command(1, .SOLID, 40, 0)));
        try std.testing.expect(try baseline_history.undo(baseline));
        const start = measured.alloc_index;
        try std.testing.expect(try baseline_history.apply(baseline, border));
        const count = measured.alloc_index - start;
        try std.testing.expect(count > 3);
        for ([_]usize{ 0, count / 2, count - 1 }) |position| {
            var failing = std.testing.FailingAllocator.init(a, .{});
            const session = try edit.Session.open(failing.allocator(), bytes);
            defer session.close();
            var history = try historyForIn(failing.allocator(), session, mode);
            defer history.deinit();
            try std.testing.expect(try history.apply(session, background(0x123456)));
            const redo_command = command(1, .SOLID, 40, 0);
            try std.testing.expect(try history.apply(session, redo_command));
            try std.testing.expect(try history.undo(session));
            const revision = history.revision();
            const before = try session.save(a, .{ .allow_stale_layout = true });
            defer a.free(before.bytes);
            failing.fail_index = failing.alloc_index + position;
            const result = history.apply(session, border);
            failing.fail_index = std.math.maxInt(usize);
            try std.testing.expectError(error.OutOfMemory, result);
            try std.testing.expectEqual(revision, history.revision());
            const after = try session.save(a, .{ .allow_stale_layout = true });
            defer a.free(after.bytes);
            try std.testing.expectEqualSlices(u8, before.bytes, after.bytes);
            // Failure retains the pre-existing redo branch and the same live session.
            try std.testing.expect(try history.redo(session));
            _ = try checkLive(session, try expectedPatch(redo_command, 0x123456));
            try std.testing.expect(try history.undo(session));
            try std.testing.expect(try history.apply(session, border));
            _ = try checkLive(session, try expectedPatch(border, 0x123456));
        }
    }
}
