const std = @import("std");
const editor = @import("editor_session.zig");
const histories = @import("editor_history.zig");
const Kind = @import("../model/paragraph_break.zig").Kind;

fn command(history: *histories.History, session: *editor.Session, kind: @FieldType(histories.Command, "kind"), paragraph: usize, at: u32, intent: ?Kind) !void {
    try std.testing.expect(try history.apply(session, .{ .kind = kind, .paragraph = paragraph, .start = at, .deleted = 0, .inserted = "", .break_before = intent }));
}
fn verify(session: *editor.Session, index: usize, kind: Kind) !void {
    const a = std.testing.allocator;
    try std.testing.expectEqual(@as(?Kind, kind), session.sections[0].structure_values.?.paragraphs[index].break_before);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const rows = try @import("paragraph_flow_snapshot.zig").read(a, &reopened, 0);
    defer @import("paragraph_flow_snapshot.zig").free(a, rows);
    try std.testing.expectEqual(@as(?bool, kind == .page), rows[index].page_break);
    try std.testing.expectEqual(@as(?bool, kind == .column), rows[index].column_break);
}

test "HWPX column flow break survives real group extension and joined continuation merge" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "multicolumns.hwpx", "multicolumns-widths.hwpx" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        for ([_]Kind{ .page, .column }) |kind| for ([_]bool{ false, true }) |extend| {
            var session = try editor.open(a, input, .{});
            defer session.deinit();
            var history = try histories.History.init(&session, 8, 8_000_000);
            defer history.deinit();
            try command(&history, &session, .merge, 1, 0, null);
            try command(&history, &session, .split, 1, 1, kind);
            const before = try session.save();
            defer a.free(before);
            const id = session.sections[0].structure_values.?.paragraphs[1].generated_id;
            if (!extend) try command(&history, &session, .split, 2, 0, null);
            const before_merge = try session.save();
            defer a.free(before_merge);
            try command(&history, &session, .merge, 2, 0, null);
            try verify(&session, 1, kind);
            try std.testing.expectEqual(id, session.sections[0].structure_values.?.paragraphs[1].generated_id);
            const saved = try session.save();
            defer a.free(saved);
            try std.testing.expect(try history.undo(&session));
            const undone = try session.save();
            defer a.free(undone);
            try std.testing.expectEqualSlices(u8, before_merge, undone);
            try std.testing.expect(try history.redo(&session));
            const redone = try session.save();
            defer a.free(redone);
            try std.testing.expectEqualSlices(u8, saved, redone);
            try std.testing.expectEqualSlices(u8, input, session.source);
        };
    }
}

test "HWPX column flow break group merge preserves untouched right continuations" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p id='1'><p:run><p:ctrl><p:colPr colCount='1'/></p:ctrl><p:t>A</p:t></p:run></p:p>" ++
        "<p:p id='2'><p:run><p:ctrl><p:colPr colCount='2'/></p:ctrl><p:t>B</p:t></p:run></p:p>" ++
        "<p:p id='3'><p:run><p:ctrl><p:colPr colCount='3'/></p:ctrl><p:t>C</p:t></p:run></p:p>" ++
        "<p:p id='4'><p:run><p:ctrl><p:colPr colCount='4'/></p:ctrl><p:t>D</p:t></p:run></p:p>");
    defer a.free(input);
    for ([_]Kind{ .page, .column }) |left_kind| {
        const right_kind: Kind = if (left_kind == .page) .column else .page;
        var session = try editor.open(a, input, .{});
        defer session.deinit();
        var history = try histories.History.init(&session, 8, 8_000_000);
        defer history.deinit();
        try command(&history, &session, .merge, 1, 0, null);
        try command(&history, &session, .split, 1, 1, left_kind);
        try command(&history, &session, .merge, 3, 0, null);
        try command(&history, &session, .split, 3, 1, right_kind);
        const before = try session.save();
        defer a.free(before);
        try command(&history, &session, .merge, 2, 0, null);
        try verify(&session, 1, left_kind);
        try verify(&session, 2, right_kind);
        try std.testing.expect(try history.undo(&session));
        const restored = try session.save();
        defer a.free(restored);
        try std.testing.expectEqualSlices(u8, before, restored);
    }
}
