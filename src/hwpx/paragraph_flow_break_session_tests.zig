const std = @import("std");
const editor = @import("editor_session.zig");
const history_mod = @import("editor_history.zig");
const Kind = @import("../model/paragraph_break.zig").Kind;
const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:t>A😀BC</p:t></p:run></p:p></s:sec>";

fn expectSaved(session: *editor.Session, expected: []const u8) !void {
    var proxy = session.*;
    proxy.allocator = std.testing.allocator;
    const saved = try proxy.save();
    defer std.testing.allocator.free(saved);
    try std.testing.expectEqualSlices(u8, expected, saved);
}

test "HWPX flow break command selects deletes splits and records exactly one undo" {
    const a = std.testing.allocator;
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(bytes);
    for ([_]Kind{ .page, .column }) |kind| {
        var session = try editor.open(a, bytes, .{});
        defer session.deinit();
        var history = try history_mod.History.init(&session, 4, 8_000_000);
        defer history.deinit();
        const first = session.sections[0].first_paragraph;
        const command: history_mod.Command = .{ .kind = .split, .section = 0, .paragraph = first, .start = 1, .deleted = 2, .inserted = "", .break_before = kind };
        try std.testing.expect(try history.apply(&session, command));
        const current = &session.sections[0].structure_values.?;
        try std.testing.expectEqual(@as(usize, 2), current.paragraphs.len);
        try std.testing.expectEqualStrings("A", current.paragraphs[0].sites.items[0].text);
        try std.testing.expectEqualStrings("BC", current.paragraphs[1].sites.items[0].text);
        try std.testing.expectEqual(@as(?Kind, kind), current.paragraphs[1].break_before);
        const saved = try session.save();
        defer a.free(saved);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        const rows = try @import("paragraph_flow_snapshot.zig").read(a, &reopened, 0);
        defer @import("paragraph_flow_snapshot.zig").free(a, rows);
        try std.testing.expectEqual(@as(?bool, kind == .page), rows[1].page_break);
        try std.testing.expectEqual(@as(?bool, kind == .column), rows[1].column_break);
        try std.testing.expect(try history.undo(&session));
        try expectSaved(&session, bytes);
        try std.testing.expect(!try history.undo(&session));
        try std.testing.expect(try history.redo(&session));
        try expectSaved(&session, saved);
        var invalid = command;
        invalid.kind = .plain;
        try std.testing.expectError(error.InvalidStructureCommand, history.applyBatch(&session, &.{ command, invalid }));
        try expectSaved(&session, saved);
        const valid_next: history_mod.Command = .{ .kind = .split, .paragraph = first + 1, .start = 0, .deleted = 0, .inserted = "", .break_before = kind };
        var late_invalid = valid_next;
        late_invalid.inserted = "unexpected";
        try std.testing.expectError(error.InvalidStructureCommand, history.applyBatch(&session, &.{ valid_next, late_invalid }));
        try expectSaved(&session, saved);
        try std.testing.expect(try history.undo(&session));
        try expectSaved(&session, bytes);
        try std.testing.expect(!try history.undo(&session));
        late_invalid = command;
        late_invalid.inserted = "unexpected";
        try std.testing.expectError(error.InvalidStructureCommand, history.applyBatch(&session, &.{ command, late_invalid }));
        try expectSaved(&session, bytes);
        try std.testing.expect(try history.redo(&session));
        try expectSaved(&session, saved);
    }
}

test "HWPX flow break refuses nested owners and malformed commands without history" {
    const a = std.testing.allocator;
    const bytes = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p id='2'><p:run><p:t>body</p:t></p:run></p:p>");
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var history = try history_mod.History.init(&session, 4, 8_000_000);
    defer history.deinit();
    const first = session.sections[0].first_paragraph;
    for ([_]Kind{ .page, .column }) |kind| {
        try std.testing.expectError(error.UnsupportedParagraphBreakOwner, history.apply(&session, .{ .kind = .split, .paragraph = first + 1, .start = 0, .deleted = 0, .inserted = "", .break_before = kind }));
        try std.testing.expectError(error.InvalidStructureCommand, history.apply(&session, .{ .kind = .split_anchored, .paragraph = first, .start = 0, .deleted = 0, .inserted = "", .break_before = kind }));
        try std.testing.expectError(error.InvalidStructureCommand, history.apply(&session, .{ .kind = .split, .paragraph = first, .start = 0, .deleted = 0, .inserted = "unexpected", .break_before = kind }));
        try expectSaved(&session, bytes);
        try std.testing.expect(!try history.undo(&session));
        try std.testing.expect(!try history.redo(&session));
    }
}

test "HWPX flow break actual fixture preserves source metadata and exact history snapshots" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    for ([_]Kind{ .page, .column }) |kind| {
        var session = try editor.open(a, bytes, .{});
        defer session.deinit();
        var history = try history_mod.History.init(&session, 4, 8_000_000);
        defer history.deinit();
        const first = session.sections[0].first_paragraph;
        try std.testing.expect(try history.apply(&session, .{ .kind = .split, .paragraph = first, .start = 0, .deleted = 0, .inserted = "", .break_before = kind }));
        const saved = try session.save();
        defer a.free(saved);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        const flows = try @import("paragraph_flow_snapshot.zig").read(a, &reopened, 0);
        defer @import("paragraph_flow_snapshot.zig").free(a, flows);
        try std.testing.expectEqual(@as(?bool, kind == .page), flows[1].page_break);
        try std.testing.expectEqual(@as(?bool, kind == .column), flows[1].column_break);
        try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, reopened.sections[0].tree.source, "<hp:secPr"));
        try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, reopened.sections[0].tree.source, "<hp:colPr"));
        try std.testing.expect(try history.undo(&session));
        try expectSaved(&session, bytes);
        try std.testing.expect(!try history.undo(&session));
        try std.testing.expect(try history.redo(&session));
        try expectSaved(&session, saved);
        try std.testing.expect(try history.apply(&session, .{ .kind = .split, .paragraph = first + 1, .start = 0, .deleted = 0, .inserted = "" }));
        try std.testing.expectEqual(@as(?Kind, kind), session.sections[0].structure_values.?.paragraphs[1].break_before);
        try std.testing.expect(session.sections[0].structure_values.?.paragraphs[2].break_before == null);
        try std.testing.expect(try history.undo(&session));
        try expectSaved(&session, saved);
        try std.testing.expectEqualSlices(u8, bytes, session.source);
    }
}

test "HWPX flow break every allocation failure preserves original and pending redo" {
    const a = std.testing.allocator;
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(bytes);
    for ([_]Kind{ .page, .column }) |kind| {
        try @import("../testing/allocation_failures.zig").check(struct {
            fn run(allocator: std.mem.Allocator, input: []const u8, intent: Kind) !void {
                var session = try editor.open(allocator, input, .{});
                defer session.deinit();
                var history = try history_mod.History.init(&session, 4, 8_000_000);
                defer history.deinit();
                const command: history_mod.Command = .{ .kind = .split, .paragraph = session.sections[0].first_paragraph, .start = 1, .deleted = 2, .inserted = "", .break_before = intent };
                _ = history.apply(&session, command) catch |err| {
                    try std.testing.expectEqual(error.OutOfMemory, err);
                    try expectSaved(&session, input);
                    try std.testing.expect(!try history.undo(&session));
                    try std.testing.expect(!try history.redo(&session));
                    return err;
                };
                var proxy = session;
                proxy.allocator = std.testing.allocator;
                const saved = try proxy.save();
                defer std.testing.allocator.free(saved);
                try std.testing.expect(try history.undo(&session));
                _ = history.apply(&session, command) catch |err| {
                    try std.testing.expectEqual(error.OutOfMemory, err);
                    try expectSaved(&session, input);
                    try std.testing.expect(!try history.undo(&session));
                    try std.testing.expect(try history.redo(&session));
                    try expectSaved(&session, saved);
                    return err;
                };
                try expectSaved(&session, saved);
                try std.testing.expect(!try history.redo(&session));
            }
        }.run, .{ bytes, kind });
    }
}
