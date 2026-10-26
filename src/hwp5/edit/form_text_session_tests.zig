const std = @import("std");
const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;
const snapshots = @import("form_property_snapshot.zig");
const a = std.testing.allocator;

fn expectText(session: *const edit.Session, node: usize, expected: []const u8) !void {
    const rows = try session.formProperties(a, 0);
    defer snapshots.deinit(a, rows);
    const wanted = try std.unicode.utf8ToUtf16LeAlloc(a, expected);
    defer a.free(wanted);
    for (rows) |row| if (row.object_node == node) {
        for (row.fields) |field| if (field.field == .text) {
            try std.testing.expectEqual(wanted.len, field.units.len);
            for (wanted, field.units) |left, right| try std.testing.expectEqual(std.mem.littleToNative(u16, left), right);
            return;
        };
    };
    std.debug.print("Missing form {d}, expected {s}; available:", .{ node, expected });
    for (rows) |row| std.debug.print(" {d}", .{row.object_node});
    std.debug.print("\n", .{});
    return error.MissingTestFormText;
}
fn equalSave(session: *const edit.Session, expected: []const u8) !void {
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try std.testing.expectEqualSlices(u8, expected, saved.bytes);
}

test "HWP5 form text layout flags remain source-owned while AutoSize combo values change" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/form-01.hwp", a, .limited(8_000_000));
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    var history = try History.init(a, session, 4, 16 * 1024 * 1024);
    defer history.deinit();
    try std.testing.expect(try history.apply(session, .{ .set_form_text = .{ .section = 0, .form_node = 31, .text = "계절😀" } }));
    try expectText(session, 31, "계절😀");
    try std.testing.expectError(error.LayoutReflowRequired, session.save(a, .{}));
    const rows = try session.formProperties(a, 0);
    defer snapshots.deinit(a, rows);
    for (rows) |row| if (row.object_node == 31) for (row.fields) |field| {
        if (field.field == .auto_size) try std.testing.expectEqualSlices(u16, &.{'1'}, field.units);
        if (field.field == .word_wrap) try std.testing.expectEqualSlices(u16, &.{'0'}, field.units);
    };
    try std.testing.expect(try history.undo(session));
    try equalSave(session, input);
}

test "HWP5 form text session owns current values across checkpoints history prefix reset and save" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/basic/calendar_monthly.hwp", a, .limited(8_000_000));
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    const size_before = try session.checkpointSize(std.math.maxInt(usize));
    var history = try History.init(a, session, 8, 16 * 1024 * 1024);
    defer history.deinit();
    const change: edit.Command = .{ .set_form_text = .{ .section = 0, .form_node = 17, .text = "2026😀" } };
    try std.testing.expect(try history.apply(session, change));
    try expectText(session, 17, "2026😀");
    try std.testing.expectEqual(size_before + @sizeOf(@import("../../model/form_values.zig").Value) + 12, try session.checkpointSize(std.math.maxInt(usize)));
    try std.testing.expect(!try history.apply(session, change));
    try std.testing.expectEqual(@as(usize, 1), history.stack.undo.items.len);
    try std.testing.expectError(error.LayoutReflowRequired, session.save(a, .{}));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    const restored = try reopened.formAnchors(a, 0);
    defer a.free(restored);
    try expectText(reopened, restored[0].object_node, "2026😀");
    try std.testing.expect(try history.undo(session));
    try equalSave(session, input);
    try std.testing.expectError(error.UnsupportedFormTextKind, history.apply(session, .{ .set_form_text = .{ .section = 0, .form_node = 21, .text = "not a text input" } }));
    try std.testing.expectError(error.InvalidFormTextTarget, history.apply(session, .{ .set_form_text = .{ .section = 0, .form_node = 0, .text = "invalid" } }));
    try std.testing.expectEqual(@as(usize, 1), history.stack.redo.items.len);
    try std.testing.expect(try history.redo(session));
    try equalSave(session, saved.bytes);
    try std.testing.expect(try history.apply(session, .{ .set_form_text = .{ .section = 0, .form_node = 19, .text = "4" } }));
    try expectText(session, 19, "4");
    try std.testing.expect(try history.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "앞😀" } }));
    try expectText(session, 17, "2026😀");
    const combined = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(combined.bytes);
    const combined_session = try edit.Session.open(a, combined.bytes);
    defer combined_session.close();
    // Saved text edits remove invalid line caches, so reopened source node IDs
    // belong to the new file and must be resolved again, not reused as IDs.
    const combined_anchors = try combined_session.formAnchors(a, 0);
    defer a.free(combined_anchors);
    try expectText(combined_session, combined_anchors[0].object_node, "2026😀");
    try expectText(combined_session, combined_anchors[1].object_node, "4");
    try std.testing.expect(try history.undo(session));
    try std.testing.expect(try history.undo(session));
    try std.testing.expect(try history.apply(session, .{ .set_form_text = .{ .section = 0, .form_node = 17, .text = "2010" } }));
    try equalSave(session, input);
    try std.testing.expectEqual(size_before, try session.checkpointSize(std.math.maxInt(usize)));
}

fn failures(allocator: std.mem.Allocator, input: []const u8) !void {
    const session = try edit.Session.open(allocator, input);
    defer session.close();
    session.apply(.{ .set_form_text = .{ .section = 0, .form_node = 17, .text = "2026😀" } }) catch |err| {
        try expectText(session, 17, "2010");
        try equalSave(session, input);
        return err;
    };
    var history = try History.init(allocator, session, 4, 16 * 1024 * 1024);
    defer history.deinit();
    _ = history.apply(session, .{ .set_form_text = .{ .section = 0, .form_node = 19, .text = "4" } }) catch |err| {
        try expectText(session, 17, "2026😀");
        try expectText(session, 19, "3");
        return err;
    };
    try expectText(session, 17, "2026😀");
    try expectText(session, 19, "4");
}
test "HWP5 form text transaction and checkpoint preserve current or committed state at every allocation failure" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/basic/calendar_monthly.hwp", a, .limited(8_000_000));
    defer a.free(input);
    try @import("../../testing/allocation_failures.zig").check(failures, .{input});
}
