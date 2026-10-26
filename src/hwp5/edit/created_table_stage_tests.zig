const std = @import("std");
const editor = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;
const records = @import("created_table_records.zig");
const model = @import("../../model/created_table.zig");
const options: records.Options = .{
    .common = .{ .flags = 0x6a2211, .offset_x = 0, .offset_y = 0, .z_order = 0, .margins = .{ 0, 0, 0, 0 }, .prevent_page_break = false, .description = "표" },
    .table = .{ .page_break = 1, .repeat_header = false, .cell_spacing = 0, .margins = .{ 0, 0, 0, 0 } },
    .cell = .{ .layout = .observed8, .unknown = 0, .attributes = 0, .margins = .{ 0, 0, 0, 0 } },
};

fn create(a: std.mem.Allocator, session: *editor.Session) !model.Table {
    var ids = try session.planTableIds(1);
    defer ids.deinit(a);
    return model.create(a, ids.identity, ids.instance_id, try @import("../../model/table_creation_plan.zig").create(1, 1, 21600, 3600, 1), ids.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 1);
}

test "HWP5 native staged table creation history restores upload and owns redo inputs" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const session = try editor.Session.open(a, input);
    defer session.close();
    const count = try session.paragraphCount(0);
    var history = try History.init(a, session, 8, 4_000_000);
    defer history.deinit();
    var table = try create(a, session);
    defer table.deinit(a);
    _ = try table.replaceText(a, 0, 0, "표😀", 100);
    var description = [_]u8{ 'a', 'b' };
    var chosen = options;
    chosen.common.description = &description;
    try std.testing.expect(try history.apply(session, .{ .stage_table = .{ .section = 0, .paragraph = 1, .unit = 0, .table = &table, .options = chosen } }));
    try std.testing.expectEqual(@as(usize, 1), try session.pendingTableCount(0));
    // Staging does not pretend generated cells are already in the UI projection.
    try std.testing.expectEqual(count, try session.paragraphCount(0));
    try std.testing.expectError(error.LayoutReflowRequired, session.save(a, .{}));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const fresh = try editor.Session.open(a, saved.bytes);
    defer fresh.close();
    try std.testing.expectEqual(count + 1, try fresh.paragraphCount(0));
    const cell = try fresh.copyText(a, 0, 2);
    defer a.free(cell);
    const expected = std.unicode.utf8ToUtf16LeStringLiteral("표😀\r");
    try std.testing.expectEqualSlices(u8, std.mem.sliceAsBytes(expected[0..expected.len]), cell);
    _ = try table.replaceText(a, 0, 0, "caller changed", 100);
    description[0] = 'z';
    chosen.common.offset_x = 999;
    try std.testing.expect(try history.undo(session));
    try std.testing.expectEqual(@as(usize, 0), try session.pendingTableCount(0));
    const undone = try session.save(a, .{});
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, input, undone.bytes);
    table.resources.border_fill = 65536;
    try std.testing.expectError(error.InvalidBorderFillReference, history.apply(session, .{ .stage_table = .{ .section = 0, .paragraph = 1, .unit = 0, .table = &table, .options = chosen } }));
    try std.testing.expectEqual(@as(usize, 1), history.stack.redo.items.len);
    try std.testing.expectEqual(@as(usize, 0), try session.pendingTableCount(0));
    table.resources.border_fill = 1;
    history.max_checkpoint_bytes = try session.checkpointSize(std.math.maxInt(usize));
    try std.testing.expectError(error.LimitExceeded, history.apply(session, .{ .stage_table = .{ .section = 0, .paragraph = 1, .unit = 0, .table = &table, .options = chosen } }));
    try std.testing.expectEqual(@as(usize, 1), history.stack.redo.items.len);
    try std.testing.expectEqual(@as(usize, 0), try session.pendingTableCount(0));
    history.max_checkpoint_bytes = 4_000_000;
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
    try std.testing.expect(try history.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "x" } }));
    const host_edited = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(host_edited.bytes);
    var host_source = try @import("../text_source.zig").Source.open(a, host_edited.bytes);
    defer host_source.deinit();
    const host_raw = try host_source.decodeSection(a, 0);
    defer a.free(host_raw);
    var host_tree = try @import("../body/tree.zig").Tree.parse(a, host_raw, host_source.header.version(), .{});
    defer host_tree.deinit(a);
    var links = try @import("../body/control_links.zig").Links.build(a, host_tree);
    defer links.deinit(a);
    var found: usize = 0;
    for (links.items) |link| if (link.id == @import("../body/control_rules.zig").table_id) {
        found += 1;
        try std.testing.expectEqual(@as(usize, 1), link.start_unit);
    };
    try std.testing.expectEqual(@as(usize, 1), found);
    try std.testing.expect(try history.undo(session));
    const host_undone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(host_undone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, host_undone.bytes);
    try std.testing.expect(try history.redo(session));
    const host_redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(host_redone.bytes);
    try std.testing.expectEqualSlices(u8, host_edited.bytes, host_redone.bytes);
    // Direct Session use has no History rollback to conceal partial mutation.
    try std.testing.expectError(error.ProtectedCreatedTableAnchor, session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 2, .utf8 = "" } }));
    const refused_host = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(refused_host.bytes);
    try std.testing.expectEqualSlices(u8, host_edited.bytes, refused_host.bytes);
}

const AllocationMode = enum { stage, cell, host, current_cell, current_host, split, merge, direct_split, direct_merge, merge_order, direct_merge_order };
fn directApply(session: *editor.Session, command: editor.Command) !bool {
    try session.apply(command);
    return true;
}
fn allocationExercise(a: std.mem.Allocator, mode: AllocationMode) !void {
    const ordered_merge = mode == .merge_order or mode == .direct_merge_order;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var failing = std.testing.FailingAllocator.init(a, .{});
    const session = try editor.Session.open(failing.allocator(), input);
    defer session.close();
    var history = try History.init(failing.allocator(), session, 4, 4_000_000);
    defer history.deinit();
    try std.testing.expect(try history.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "이력" } }));
    try std.testing.expect(try history.undo(session));
    var table = try create(failing.allocator(), session);
    defer table.deinit(failing.allocator());
    const stage: editor.Command = .{ .stage_table = .{ .section = 0, .paragraph = if (ordered_merge) 2 else 1, .unit = 0, .table = &table, .options = options } };
    const cell: editor.Command = .{ .set_created_cell_text = .{ .point = .{ .section = 0, .table = table.identity, .row = 0, .column = 0 }, .utf8 = "실패 검사😀" } };
    const host: editor.Command = .{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "호스트😀" } };
    if (mode != .stage) try std.testing.expect(try history.apply(session, stage));
    if (ordered_merge) {
        var second = try create(failing.allocator(), session);
        defer second.deinit(failing.allocator());
        try std.testing.expect(try history.apply(session, .{ .stage_table = .{ .section = 0, .paragraph = 1, .unit = 0, .table = &second, .options = options } }));
    }
    const refs = if (mode == .current_cell or mode == .current_host) try session.currentParagraphReferences(a, 0, 10000) else try a.alloc(@import("created_table_paragraphs.zig").Reference, 0);
    defer a.free(refs);
    const command: editor.Command = switch (mode) {
        .stage => stage,
        .cell => cell,
        .host => host,
        .split, .direct_split => .{ .split_paragraph = .{ .section = 0, .paragraph = 1, .at_unit = 0 } },
        .merge, .direct_merge, .merge_order, .direct_merge_order => .{ .merge_paragraph = .{ .section = 0, .paragraph = 1 } },
        .current_cell, .current_host => .{ .splice_current_paragraph = .{ .section = 0, .reference = refs[if (mode == .current_cell) @as(usize, 2) else 1], .start_unit = 0, .end_unit = 0, .utf8 = "참조😀" } },
    };
    if (mode != .stage) {
        try std.testing.expect(try history.apply(session, command));
        try std.testing.expect(try history.undo(session));
    }
    const baseline = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(baseline.bytes);
    const entries: usize = if (mode == .stage) 0 else if (ordered_merge) 2 else 1;
    for (0..10000) |index| {
        failing.fail_index = failing.alloc_index + index;
        const direct = mode == .direct_split or mode == .direct_merge or mode == .direct_merge_order;
        const result = if (direct) directApply(session, command) else history.apply(session, command);
        failing.fail_index = std.math.maxInt(usize);
        if (result) |changed| {
            try std.testing.expect(changed);
            try std.testing.expectEqual(@as(usize, if (ordered_merge) 2 else 1), try session.pendingTableCount(0));
            if (direct) {
                try std.testing.expectEqual(entries, history.stack.undo.items.len);
                try std.testing.expectEqual(@as(usize, 1), history.stack.redo.items.len);
                return;
            }
            try std.testing.expectEqual(entries + 1, history.stack.undo.items.len);
            try std.testing.expectEqual(@as(usize, 0), history.stack.redo.items.len);
            try std.testing.expect(try history.undo(session));
            const restored = try session.save(a, .{ .allow_stale_layout = true });
            defer a.free(restored.bytes);
            try std.testing.expectEqualSlices(u8, baseline.bytes, restored.bytes);
            return;
        } else |err| {
            try std.testing.expectEqual(error.OutOfMemory, err);
            try std.testing.expectEqual(entries, try session.pendingTableCount(0));
            try std.testing.expectEqual(entries, history.stack.undo.items.len);
            try std.testing.expectEqual(@as(usize, 1), history.stack.redo.items.len);
            if (mode == .cell or mode == .current_cell) {
                const native = try session.copyCreatedCellUtf8(a, cell.set_created_cell_text.point);
                defer a.free(native);
                try std.testing.expectEqualStrings("", native);
            }
            const unchanged = try session.save(a, .{ .allow_stale_layout = true });
            defer a.free(unchanged.bytes);
            try std.testing.expectEqualSlices(u8, baseline.bytes, unchanged.bytes);
        }
    }
    return error.TestAllocationSweepIncomplete;
}

test "HWP5 native staged table every allocation failure preserves upload and existing redo" {
    try @import("../../testing/checked_allocator.zig").run(allocationExercise, .{AllocationMode.stage});
}

test "HWP5 generated cell every allocation failure preserves native value and existing redo" {
    try @import("../../testing/checked_allocator.zig").run(allocationExercise, .{AllocationMode.cell});
}

test "HWP5 staged table host splice every allocation failure preserves text anchors and redo" {
    try @import("../../testing/checked_allocator.zig").run(allocationExercise, .{AllocationMode.host});
}

test "HWP5 staged table split every allocation failure preserves topology anchors and redo" {
    try @import("../../testing/checked_allocator.zig").run(allocationExercise, .{AllocationMode.split});
}

test "HWP5 staged table merge every allocation failure preserves topology anchors and redo" {
    try @import("../../testing/checked_allocator.zig").run(allocationExercise, .{AllocationMode.merge});
}

test "HWP5 direct staged split every allocation failure preserves model without history rollback" {
    try @import("../../testing/checked_allocator.zig").run(allocationExercise, .{AllocationMode.direct_split});
}

test "HWP5 direct staged merge every allocation failure preserves model without history rollback" {
    try @import("../../testing/checked_allocator.zig").run(allocationExercise, .{AllocationMode.direct_merge});
}

test "HWP5 staged merge ordering every allocation failure preserves both tables and redo" {
    try @import("../../testing/checked_allocator.zig").run(allocationExercise, .{AllocationMode.merge_order});
}

test "HWP5 direct staged merge ordering every allocation failure preserves both tables" {
    try @import("../../testing/checked_allocator.zig").run(allocationExercise, .{AllocationMode.direct_merge_order});
}

test "HWP5 current paragraph cell route every allocation failure preserves native values and redo" {
    try @import("../../testing/checked_allocator.zig").run(allocationExercise, .{AllocationMode.current_cell});
}

test "HWP5 current paragraph source route every allocation failure preserves native values and redo" {
    try @import("../../testing/checked_allocator.zig").run(allocationExercise, .{AllocationMode.current_host});
}

test "HWP5 generated cell native text owns save history and rejects stale identities" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const session = try editor.Session.open(a, input);
    defer session.close();
    var history = try History.init(a, session, 8, 4_000_000);
    defer history.deinit();
    var table = try create(a, session);
    defer table.deinit(a);
    try std.testing.expect(try history.apply(session, .{ .stage_table = .{ .section = 0, .paragraph = 1, .unit = 0, .table = &table, .options = options } }));
    const created = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(created.bytes);
    const point: @import("created_cell_text.zig").Point = .{ .section = 0, .table = table.identity, .row = 0, .column = 0 };
    const text = "편집😀\n다음";
    try std.testing.expect(try history.apply(session, .{ .set_created_cell_text = .{ .point = point, .utf8 = text } }));
    const current = try session.copyCreatedCellUtf8(a, point);
    defer a.free(current);
    try std.testing.expectEqualStrings(text, current);
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const fresh = try editor.Session.open(a, saved.bytes);
    defer fresh.close();
    const cell = try fresh.copyText(a, 0, 2);
    defer a.free(cell);
    const expected = std.unicode.utf8ToUtf16LeStringLiteral("편집😀\n다음\r");
    try std.testing.expectEqualSlices(u8, std.mem.sliceAsBytes(expected[0..expected.len]), cell);
    const refs = try session.currentParagraphReferences(a, 0, 10000);
    defer a.free(refs);
    try std.testing.expectEqual(try session.paragraphCount(0) + 1, refs.len);
    try std.testing.expectEqualDeep(point, refs[2].created_cell);
    const current_text = try session.copyCurrentParagraphTextUtf16(a, 0, refs[2]);
    defer a.free(current_text);
    try std.testing.expectEqualSlices(u8, cell, current_text);
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, owner: *const editor.Session, expected_cell: []const u8) !void {
            const view = try owner.currentParagraphReferences(allocator, 0, 10000);
            defer allocator.free(view);
            const value = try owner.copyCurrentParagraphTextUtf16(allocator, 0, view[2]);
            defer allocator.free(value);
            try std.testing.expectEqualSlices(u8, expected_cell, value);
        }
    }.run, .{ @as(*const editor.Session, session), @as([]const u8, cell) });
    try std.testing.expectError(error.LimitExceeded, session.currentParagraphReferences(a, 0, refs.len - 1));
    var wrong_section = refs[0];
    wrong_section.source.section = 1;
    try std.testing.expectError(error.SourceBindingMismatch, session.copyCurrentParagraphTextUtf16(a, 0, wrong_section));
    wrong_section = refs[2];
    wrong_section.created_cell.section = 1;
    try std.testing.expectError(error.SourceBindingMismatch, session.copyCurrentParagraphTextUtf16(a, 0, wrong_section));
    try std.testing.expect(try history.undo(session));
    const restored = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(restored.bytes);
    try std.testing.expectEqualSlices(u8, created.bytes, restored.bytes);
    try std.testing.expect(!try history.apply(session, .{ .set_created_cell_text = .{ .point = point, .utf8 = "" } }));
    try std.testing.expectError(error.InvalidTableCellText, history.apply(session, .{ .set_created_cell_text = .{ .point = point, .utf8 = &.{255} } }));
    try std.testing.expectError(error.UnsupportedTextControl, history.apply(session, .{ .set_created_cell_text = .{ .point = point, .utf8 = "\t" } }));
    var invalid = point;
    invalid.row = 1;
    try std.testing.expectError(error.InvalidTableCell, history.apply(session, .{ .set_created_cell_text = .{ .point = invalid, .utf8 = "x" } }));
    try std.testing.expectEqual(@as(usize, 1), history.stack.redo.items.len);
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
    try std.testing.expect(try history.undo(session));
    try std.testing.expect(try history.undo(session));
    try std.testing.expectError(error.InvalidCreatedTableIdentity, session.copyCreatedCellUtf8(a, point));
    try std.testing.expectError(error.InvalidCreatedTableIdentity, session.copyCurrentParagraphTextUtf16(a, 0, refs[2]));
    const original = try session.save(a, .{});
    defer a.free(original.bytes);
    try std.testing.expectEqualSlices(u8, input, original.bytes);
    try std.testing.expect(try history.redo(session));
    try std.testing.expect(try history.redo(session));
    const repeated = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(repeated.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, repeated.bytes);
}

test "HWP5 current paragraph references splice source and generated cell without ordinal aliasing" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const session = try editor.Session.open(a, input);
    defer session.close();
    var history = try History.init(a, session, 8, 4_000_000);
    defer history.deinit();
    var table = try create(a, session);
    defer table.deinit(a);
    _ = try table.replaceText(a, 0, 0, "a😀한", 100);
    try std.testing.expect(try history.apply(session, .{ .stage_table = .{ .section = 0, .paragraph = 1, .unit = 0, .table = &table, .options = options } }));
    const created = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(created.bytes);
    const refs = try session.currentParagraphReferences(a, 0, 10000);
    defer a.free(refs);
    const cell_command: editor.Command = .{ .splice_current_paragraph = .{ .section = 0, .reference = refs[2], .start_unit = 1, .end_unit = 3, .utf8 = "둘\n" } };
    try std.testing.expect(try history.apply(session, cell_command));
    const cell_saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(cell_saved.bytes);
    try std.testing.expect(try history.undo(session));
    try std.testing.expectError(error.SplitSurrogatePair, history.apply(session, .{ .splice_current_paragraph = .{ .section = 0, .reference = refs[2], .start_unit = 2, .end_unit = 3, .utf8 = "x" } }));
    var wrong = refs[2];
    wrong.created_cell.section = 1;
    try std.testing.expectError(error.SourceBindingMismatch, history.apply(session, .{ .splice_current_paragraph = .{ .section = 0, .reference = wrong, .start_unit = 0, .end_unit = 0, .utf8 = "x" } }));
    try std.testing.expect(!try history.apply(session, .{ .splice_current_paragraph = .{ .section = 0, .reference = refs[2], .start_unit = 0, .end_unit = 0, .utf8 = "" } }));
    try std.testing.expectEqual(@as(usize, 1), history.stack.redo.items.len);
    try std.testing.expect(try history.redo(session));
    try std.testing.expect(try history.apply(session, .{ .splice_current_paragraph = .{ .section = 0, .reference = refs[1], .start_unit = 0, .end_unit = 0, .utf8 = "앞" } }));
    const final = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(final.bytes);
    const fresh = try editor.Session.open(a, final.bytes);
    defer fresh.close();
    const cell = try fresh.copyText(a, 0, 2);
    defer a.free(cell);
    const expected = std.unicode.utf8ToUtf16LeStringLiteral("a둘\n한\r");
    try std.testing.expectEqualSlices(u8, std.mem.sliceAsBytes(expected[0..expected.len]), cell);
    try std.testing.expect(try history.undo(session));
    const source_undone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(source_undone.bytes);
    try std.testing.expectEqualSlices(u8, cell_saved.bytes, source_undone.bytes);
    try std.testing.expect(try history.undo(session));
    const cell_undone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(cell_undone.bytes);
    try std.testing.expectEqualSlices(u8, created.bytes, cell_undone.bytes);
    try std.testing.expect(try history.redo(session));
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, final.bytes, redone.bytes);
}
