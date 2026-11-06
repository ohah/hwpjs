const std = @import("std");
const a = std.testing.allocator;
const edit = @import("style_preservation.zig");
const Source = @import("../text_source.zig").Source;
const backgrounds = @import("border_fill_sources.zig");
const Target = struct { command: edit.Command, source_id: u16, paragraph: u32 };
fn fixture() ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwp", a, .limited(8_000_000));
}
fn target(session: *const edit.Session, require_shared: bool) !Target {
    const rows = try session.cellLayoutSources(a, 0);
    defer a.free(rows);
    const bindings = try session.tableBindings(a, 0);
    defer a.free(bindings);
    const fills = try session.borderFillSources(a);
    defer backgrounds.deinit(a, fills);
    for (rows) |row| {
        if (row.protected or row.border_fill_id == 0 or row.border_fill_id > fills.len) continue;
        const fill = fills[row.border_fill_id - 1];
        const pattern = fill.pattern orelse continue;
        if (!fill.fill_known or fill.fill_flags != 1 or pattern.kind != -1 or pattern.background == 0x563412) continue;
        var shared: usize = 0;
        for (rows) |other| if (other.border_fill_id == row.border_fill_id) {
            shared += 1;
        };
        if (require_shared and shared < 2) continue;
        for (bindings) |binding| if (binding.table_node == row.table_record_node and binding.list_node == row.list_node) {
            const text = try session.copyText(a, 0, binding.paragraph);
            defer a.free(text);
            if (text.len <= 2) continue;
            return .{
                .command = .{ .set_cell_background = .{ .section = 0, .table_node = @intCast(row.table_record_node), .list_node = @intCast(row.list_node), .color = 0x123456 } },
                .source_id = row.border_fill_id,
                .paragraph = binding.paragraph,
            };
        };
    }
    return error.NoSupportedNooriCell;
}
fn live(session: *const edit.Session, chosen: Target) !u16 {
    const rows = try session.cellLayoutSources(a, 0);
    defer a.free(rows);
    const fills = try session.borderFillSources(a);
    defer backgrounds.deinit(a, fills);
    const e = chosen.command.set_cell_background;
    for (rows) |row| if (row.table_record_node == e.table_node and row.list_node == e.list_node) {
        try std.testing.expect(row.border_fill_id != chosen.source_id);
        const fill = fills[row.border_fill_id - 1];
        try std.testing.expectEqual(wireColor(chosen), fill.pattern.?.background);
        return row.border_fill_id;
    };
    return error.MissingSelectedCell;
}
fn wireColor(chosen: Target) u32 {
    const rgb = chosen.command.set_cell_background.color;
    return ((rgb >> 16) & 255) | (rgb & 0xff00) | ((rgb & 255) << 16);
}
fn independentSave(input: []const u8, output: []const u8, chosen: Target, id: u16) !void {
    var old = try Source.open(a, input);
    defer old.deinit();
    var next = try Source.open(a, output);
    defer next.deinit();
    var streams: usize = 0;
    for (old.file.entries, 0..) |entry, index| {
        if (entry.kind != 2) continue;
        const path = try old.file.rootRelativePath(index);
        const content = try next.file.readStream(a, path);
        if (!std.mem.eql(u8, path, "/DocInfo") and !std.mem.eql(u8, path, "/BodyText/Section0"))
            try std.testing.expectEqualSlices(u8, entry.content, content);
        streams += 1;
    }
    var new_streams: usize = 0;
    for (next.file.entries) |entry| if (entry.kind == 2) {
        new_streams += 1;
    };
    try std.testing.expectEqual(streams, new_streams);
    const raw = try old.decodeSection(a, 0);
    defer a.free(raw);
    const saved = try next.decodeSection(a, 0);
    defer a.free(saved);
    const expected = try a.dupe(u8, raw);
    defer a.free(expected);
    var records = @import("../record.zig").Iterator.init(raw, .{});
    var node: usize = 0;
    var found = false;
    while (try records.next()) |r| : (node += 1) if (node == chosen.command.set_cell_background.list_node) {
        // Explicit observed8 header + Table80 border-fill offset24; independent of writer.
        const at = r.offset + r.raw.len - r.payload.len + 8 + 24;
        std.mem.writeInt(u16, expected[at..][0..2], id, .little);
        found = true;
    };
    try std.testing.expect(found);
    try std.testing.expectEqualSlices(u8, expected, saved);
    const info = try old.decodeDocInfo(a, 32_000_000);
    defer a.free(info);
    const saved_info = try next.decodeDocInfo(a, 32_000_000);
    defer a.free(saved_info);
    var before = @import("../record.zig").Iterator.init(info, .{});
    var after = @import("../record.zig").Iterator.init(saved_info, .{});
    var fill_count: u32 = 0;
    while (try before.next()) |r| {
        const n = (try after.next()) orelse return error.MissingDocInfoRecord;
        try std.testing.expectEqual(r.tag, n.tag);
        if (r.tag == 17) {
            const expected_mapping = try a.dupe(u8, r.payload);
            defer a.free(expected_mapping);
            const count = std.mem.readInt(i32, expected_mapping[32..36], .little);
            std.mem.writeInt(i32, expected_mapping[32..36], count + 1, .little);
            try std.testing.expectEqualSlices(u8, expected_mapping, n.payload);
        } else try std.testing.expectEqualSlices(u8, r.raw, n.raw);
        if (r.tag == 20) {
            fill_count += 1;
            if (fill_count + 1 == id) {
                const clone = (try after.next()) orelse return error.MissingCowResource;
                try std.testing.expectEqual(@as(u16, 20), clone.tag);
                const source = try @import("border_fill_docinfo_patch.zig").resource(info, chosen.source_id);
                const no_fill = std.mem.readInt(u32, source[32..36], .little) == 0;
                const cow_expected = try a.alloc(u8, source.len + @as(usize, if (no_fill) 12 else 0));
                defer a.free(cow_expected);
                if (no_fill) {
                    // Independent constructor expectation: original absent pattern
                    // becomes flags1/backgroundRGB/foregroundRGB/kind-1. The old
                    // additional-length/tail bytes are retained after the new fields.
                    @memcpy(cow_expected[0..32], source[0..32]);
                    std.mem.writeInt(u32, cow_expected[32..36], 1, .little);
                    std.mem.writeInt(u32, cow_expected[40..44], wireColor(chosen), .little);
                    std.mem.writeInt(i32, cow_expected[44..48], -1, .little);
                    @memcpy(cow_expected[48..], source[36..]);
                } else @memcpy(cow_expected, source);
                std.mem.writeInt(u32, cow_expected[36..40], wireColor(chosen), .little);
                try std.testing.expectEqualSlices(u8, cow_expected, clone.payload);
            }
        }
    }
    try std.testing.expect((try after.next()) == null);
}

test "cell background HWP5 Noori live COW save undo redo non-target streams V1 V2" {
    const bytes = try fixture();
    defer a.free(bytes);
    for ([_]bool{ false, true }) |v2| {
        const session = try edit.Session.open(a, bytes);
        defer session.close();
        const chosen = try target(session, false);
        var history = if (v2) try @import("editor_history.zig").History.initV2(a, session, .{ .max_entries = 8, .max_checkpoint_bytes = 8_000_000, .max_retained_bytes = 48_000_000 }) else try @import("editor_history.zig").History.init(a, session, 8, 8_000_000);
        defer history.deinit();
        try std.testing.expect(try history.apply(session, chosen.command));
        const id = try live(session, chosen); // No save has run.
        try std.testing.expect(!try history.apply(session, chosen.command));
        try std.testing.expectEqual(id, try live(session, chosen));
        const saved = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(saved.bytes);
        try independentSave(bytes, saved.bytes, chosen, id);
        const reopened = try edit.Session.open(a, saved.bytes);
        defer reopened.close();
        _ = try live(reopened, chosen);
        try std.testing.expect(try history.undo(session));
        const restored = try session.save(a, .{});
        defer a.free(restored.bytes);
        try std.testing.expectEqualSlices(u8, bytes, restored.bytes);
        try std.testing.expect(try history.redo(session));
        const redone = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(redone.bytes);
        try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
        var wrong = chosen.command;
        wrong.set_cell_background.table_node +%= 1;
        try std.testing.expectError(error.InvalidCellDisplayOwner, history.apply(session, wrong));
        wrong = chosen.command;
        wrong.set_cell_background.color = 0x1000000;
        try std.testing.expectError(error.InvalidCharacterColor, history.apply(session, wrong));
        _ = try live(session, chosen);
    }
}

test "cell background HWP5 Noori live IDs follow mixed character paragraph COW in both orders" {
    const bytes = try fixture();
    defer a.free(bytes);
    for ([_]bool{ false, true }) |background_first| {
        const session = try edit.Session.open(a, bytes);
        defer session.close();
        const chosen = try target(session, false);
        if (background_first) {
            try session.apply(chosen.command);
            _ = try live(session, chosen);
        }
        const before_para = session.paragraphShapeCount();
        const before_char = session.characterShapeCount();
        const before_info = try session.formattingSource(a);
        defer a.free(before_info.bytes);
        const original_alignment = try @import("border_fill_paragraph_current.zig").alignment(before_info.bytes, before_info.version, try session.paragraphShapeId(0, chosen.paragraph));
        try session.apply(.{ .set_paragraph_alignment = .{ .section = 0, .paragraph = chosen.paragraph, .alignment = if (original_alignment == 1) 2 else 1 } });
        try session.apply(.{ .set_character_properties = .{ .section = 0, .paragraph = chosen.paragraph, .start_unit = 0, .end_unit = 1, .properties = .{ .size = 1701 } } });
        try std.testing.expect(session.paragraphShapeCount() > before_para);
        try std.testing.expect(session.characterShapeCount() > before_char);
        if (!background_first) try session.apply(chosen.command);
        const id = try live(session, chosen);
        const info = try session.formattingSource(a);
        defer a.free(info.bytes);
        const p = try @import("border_fill_docinfo_patch.zig").resource(info.bytes, id);
        try std.testing.expectEqual(@as(u32, 0x563412), std.mem.readInt(u32, p[36..40], .little));
        const saved = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(saved.bytes);
        const reopen = try edit.Session.open(a, saved.bytes);
        defer reopen.close();
        try std.testing.expectEqual(id, try live(reopen, chosen));
    }
}

test "cell background HWP5 controlled Noori-derived shared resource remains unchanged for other users" {
    const bytes = try fixture();
    defer a.free(bytes);
    var original = try Source.open(a, bytes);
    defer original.deinit();
    const raw = try original.decodeSection(a, 0);
    defer a.free(raw);
    const changed = try a.dupe(u8, raw);
    defer a.free(changed);
    // Explicit controlled derivation, NOT an original Noori sharing claim:
    // original list21 uses BF15, list26 uses BF16 with the same visible source color.
    var records = @import("../record.zig").Iterator.init(raw, .{});
    var node: u32 = 0;
    var patched = false;
    while (try records.next()) |r| : (node += 1) if (node == 26) {
        try std.testing.expectEqual(@as(u16, 72), r.tag);
        const offset = r.offset + r.raw.len - r.payload.len + 32;
        try std.testing.expectEqual(@as(u16, 16), std.mem.readInt(u16, changed[offset..][0..2], .little));
        std.mem.writeInt(u16, changed[offset..][0..2], 15, .little);
        patched = true;
    };
    try std.testing.expect(patched);
    const encoded = if (original.header.has(.compressed)) try @import("../../compression/raw_deflate.zig").encodeStored(a, changed, 32_000_000) else try a.dupe(u8, changed);
    defer a.free(encoded);
    const derived = try @import("../../cfb/stream_replace.zig").rebuildManyExact(a, &original.file, &.{.{ .path = "/BodyText/Section0", .content = encoded }}, .{ .max_output_bytes = 8_000_000 });
    defer a.free(derived);
    const session = try edit.Session.open(a, derived);
    defer session.close();
    const chosen = try target(session, true);
    try std.testing.expectEqual(@as(u16, 15), chosen.source_id);
    try session.apply(chosen.command);
    const id = try live(session, chosen);
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try independentSave(derived, saved.bytes, chosen, id);
    const rows = try session.cellLayoutSources(a, 0);
    defer a.free(rows);
    for (rows) |row| if (row.list_node == 26) try std.testing.expectEqual(@as(u16, 15), row.border_fill_id);
}

test "cell background HWP5 ORIGINAL Noori shared no-fill creates requested solid and black without mutating source" {
    const bytes = try fixture();
    defer a.free(bytes);
    for ([_]u32{ 0, 0x123456 }) |color| {
        const session = try edit.Session.open(a, bytes);
        defer session.close();
        const before = try session.cellLayoutSources(a, 0);
        defer a.free(before);
        const fills = try session.borderFillSources(a);
        defer backgrounds.deinit(a, fills);
        try std.testing.expectEqual(@as(u32, 0), fills[1].fill_flags);
        try std.testing.expect(fills[1].pattern == null);
        const chosen: Target = .{
            .command = .{ .set_cell_background = .{ .section = 0, .table_node = 200, .list_node = 201, .color = color } },
            .source_id = 2,
            .paragraph = 0,
        };
        var users: usize = 0;
        for (before) |row| if (row.border_fill_id == 2) {
            users += 1;
        };
        try std.testing.expectEqual(@as(usize, 24), users);
        var history = try @import("editor_history.zig").History.init(a, session, 8, 8_000_000);
        defer history.deinit();
        try std.testing.expect(try history.apply(session, chosen.command));
        const id = try live(session, chosen); // Original Noori, no save or derived fixture.
        try std.testing.expect(!try history.apply(session, chosen.command));
        const after = try session.cellLayoutSources(a, 0);
        defer a.free(after);
        try std.testing.expectEqual(before.len, after.len);
        for (before, after) |old, current| {
            if (old.table_record_node == 200 and old.list_node == 201)
                try std.testing.expectEqual(id, current.border_fill_id)
            else
                try std.testing.expectEqualDeep(old, current);
        }
        const live_fills = try session.borderFillSources(a);
        defer backgrounds.deinit(a, live_fills);
        try std.testing.expect(live_fills[1].pattern == null);
        try std.testing.expectEqual(@as(u32, 0), live_fills[1].fill_flags);
        try std.testing.expectEqual(wireColor(chosen), live_fills[id - 1].pattern.?.foreground);
        const saved = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(saved.bytes);
        try independentSave(bytes, saved.bytes, chosen, id);
        const reopened = try edit.Session.open(a, saved.bytes);
        defer reopened.close();
        _ = try live(reopened, chosen);
        try std.testing.expect(try history.undo(session));
        const original = try session.save(a, .{});
        defer a.free(original.bytes);
        try std.testing.expectEqualSlices(u8, bytes, original.bytes);
        try std.testing.expect(try history.redo(session));
        const redone = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(redone.bytes);
        try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
    }
}
