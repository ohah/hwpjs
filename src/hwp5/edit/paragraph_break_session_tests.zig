const std = @import("std");
const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;
const Kind = @import("../../model/paragraph_break.zig").Kind;
const a = std.testing.allocator;

fn expectSaved(session: *edit.Session, expected: []const u8) !void {
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try std.testing.expectEqualSlices(u8, expected, saved.bytes);
}

fn expectFlags(session: *edit.Session, paragraph: usize, flags: u8) !void {
    const flows = try session.paragraphFlow(a, 0);
    defer a.free(flows);
    try std.testing.expectEqual(flags, flows[paragraph].break_flags);
    try std.testing.expectEqual(flags & 4 != 0, flows[paragraph].page_break);
    try std.testing.expectEqual(flags & 8 != 0, flows[paragraph].column_break);
}

test "explicit flow break split saves one history transaction and ordinary continuation clears intent" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    for ([_]Kind{ .page, .column }) |kind| {
        const session = try edit.Session.open(a, input);
        defer session.close();
        var history = try History.init(a, session, 8, 8_000_000);
        defer history.deinit();
        const count = try session.paragraphCount(0);
        const original_text = try session.copyText(a, 0, 1);
        defer a.free(original_text);
        try std.testing.expect(try history.apply(session, .{ .split_paragraph = .{ .section = 0, .paragraph = 1, .at_unit = 1, .break_before = kind } }));
        try std.testing.expectEqual(count + 1, try session.paragraphCount(0));
        const left = try session.copyText(a, 0, 1);
        defer a.free(left);
        const right = try session.copyText(a, 0, 2);
        defer a.free(right);
        try std.testing.expectEqualSlices(u8, original_text[0..2], left[0 .. left.len - 2]);
        try std.testing.expectEqualSlices(u8, &.{ 13, 0 }, left[left.len - 2 ..]);
        try std.testing.expectEqualSlices(u8, original_text[2..], right);
        const flags: u8 = if (kind == .page) 4 else 8;
        try expectFlags(session, 2, flags);
        const saved = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(saved.bytes);
        const reopened = try edit.Session.open(a, saved.bytes);
        defer reopened.close();
        try expectFlags(reopened, 2, flags);
        try std.testing.expect(try history.undo(session));
        try expectSaved(session, input);
        try std.testing.expect(!try history.undo(session));
        try std.testing.expect(try history.redo(session));
        try expectSaved(session, saved.bytes);
        try std.testing.expect(try history.apply(session, .{ .split_paragraph = .{ .section = 0, .paragraph = 2, .at_unit = 0 } }));
        try expectFlags(session, 2, flags);
        try expectFlags(session, 3, 0);
        const ordinary = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(ordinary.bytes);
        const next = try edit.Session.open(a, ordinary.bytes);
        defer next.close();
        try expectFlags(next, 2, flags);
        try expectFlags(next, 3, 0);
        try std.testing.expect(try history.apply(session, .{ .merge_paragraph = .{ .section = 0, .paragraph = 2 } }));
        try expectFlags(session, 2, flags);
        try expectSaved(session, saved.bytes);
        try std.testing.expect(try history.undo(session));
        try expectSaved(session, ordinary.bytes);
        try std.testing.expect(try history.undo(session));
        try expectSaved(session, saved.bytes);
    }
}

test "explicit flow break refuses nested owners without touching source or history" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/software.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    var history = try History.init(a, session, 8, 8_000_000);
    defer history.deinit();
    for ([_]Kind{ .page, .column }) |kind| {
        try std.testing.expectError(error.UnsupportedParagraphBreakOwner, history.apply(session, .{ .split_paragraph = .{ .section = 0, .paragraph = 2, .at_unit = 0, .break_before = kind } }));
        try expectSaved(session, input);
        try std.testing.expect(!try history.undo(session));
        try std.testing.expect(!try history.redo(session));
    }
}

test "explicit flow break selected split keeps document and pending redo through every allocation failure" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    for ([_]Kind{ .page, .column }) |kind| try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, selected: Kind) !void {
            const session = try edit.Session.open(allocator, bytes);
            defer session.close();
            var history = try History.init(allocator, session, 4, 8_000_000);
            defer history.deinit();
            const command: edit.Command = .{ .split_paragraph = .{ .section = 0, .paragraph = 1, .at_unit = 1, .end_unit = 3, .break_before = selected } };
            _ = history.apply(session, command) catch |err| {
                try expectSaved(session, bytes);
                try std.testing.expectEqual(@as(usize, 0), history.stack.undo.items.len);
                try std.testing.expectEqual(@as(usize, 0), history.stack.redo.items.len);
                return err;
            };
            const saved = try session.save(a, .{ .allow_stale_layout = true });
            defer a.free(saved.bytes);
            try std.testing.expect(try history.undo(session));
            try expectSaved(session, bytes);
            _ = history.apply(session, command) catch |err| {
                try expectSaved(session, bytes);
                try std.testing.expectEqual(@as(usize, 0), history.stack.undo.items.len);
                try std.testing.expectEqual(@as(usize, 1), history.stack.redo.items.len);
                try std.testing.expect(try history.redo(session));
                try expectSaved(session, saved.bytes);
                return err;
            };
            try expectSaved(session, saved.bytes);
            try std.testing.expectEqual(@as(usize, 0), history.stack.redo.items.len);
        }
    }.run, .{ input, kind });
}
