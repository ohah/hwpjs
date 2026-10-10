const std = @import("std");
const edit = @import("style_preservation.zig");
const commands = [_]edit.Command{
    .{ .set_character_properties = .{ .section = 0, .paragraph = 5, .start_unit = 0, .end_unit = 1, .properties = .{ .underline_color = 0x123456, .underline_kind = .bottom } } },
    .{ .set_character_properties = .{ .section = 0, .paragraph = 6, .start_unit = 0, .end_unit = 1, .properties = .{ .bold = true, .size = 2400, .underline_kind = .bottom } } },
};

test "HWP5 history batch commits multiple paragraphs once and rolls back a later refusal" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    var history = try @import("editor_history.zig").History.init(a, session, 8, 4_000_000);
    defer history.deinit();
    try std.testing.expect(!try history.applyBatch(session, &.{}));
    try std.testing.expect(try history.applyBatch(session, &commands));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    // 같은 속성을 다시 적용한 묶음은 이력 항목을 추가하지 않습니다.
    try std.testing.expect(!try history.applyBatch(session, &commands));
    try std.testing.expectEqual(@as(usize, 1), history.stack.undo.items.len);
    try std.testing.expect(try history.undo(session));
    try std.testing.expect(!try history.undo(session));
    try std.testing.expect(!try history.applyBatch(session, &.{}));
    try std.testing.expectEqual(@as(usize, 1), history.stack.redo.items.len);
    const original = try session.save(a, .{});
    defer a.free(original.bytes);
    try std.testing.expectEqualSlices(u8, input, original.bytes);
    var refused = commands;
    refused[1].set_character_properties.properties.size = -1;
    try std.testing.expectError(error.InvalidCharacterSize, history.applyBatch(session, &refused));
    const unchanged = try session.save(a, .{});
    defer a.free(unchanged.bytes);
    try std.testing.expectEqualSlices(u8, input, unchanged.bytes);
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
    try std.testing.expect(try history.undo(session));
    history.max_checkpoint_bytes = try session.checkpointSize(std.math.maxInt(usize));
    try std.testing.expectError(error.LimitExceeded, history.applyBatch(session, &commands));
    const budget_restored = try session.save(a, .{});
    defer a.free(budget_restored.bytes);
    try std.testing.expectEqualSlices(u8, input, budget_restored.bytes);
    try std.testing.expectEqual(@as(usize, 0), history.stack.undo.items.len);
    try std.testing.expectEqual(@as(usize, 1), history.stack.redo.items.len);
}

test "HWP5 history batch every command allocation failure preserves original and existing redo" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var failing = std.testing.FailingAllocator.init(a, .{});
    const session = try edit.Session.open(failing.allocator(), input);
    defer session.close();
    var history = try @import("editor_history.zig").History.init(failing.allocator(), session, 8, 4_000_000);
    defer history.deinit();
    try std.testing.expect(try history.applyBatch(session, &commands));
    try std.testing.expect(try history.undo(session));
    const count = session.characterShapeCount();
    for (0..10_000) |index| {
        failing.fail_index = failing.alloc_index + index;
        const result = history.applyBatch(session, &commands);
        failing.fail_index = std.math.maxInt(usize);
        if (result) |changed| {
            try std.testing.expect(changed);
            try std.testing.expectEqual(@as(usize, 1), history.stack.undo.items.len);
            try std.testing.expectEqual(@as(usize, 0), history.stack.redo.items.len);
            try std.testing.expect(try history.undo(session));
            const restored = try session.save(a, .{});
            defer a.free(restored.bytes);
            try std.testing.expectEqualSlices(u8, input, restored.bytes);
            return;
        } else |err| {
            try std.testing.expectEqual(error.OutOfMemory, err);
            try std.testing.expectEqual(count, session.characterShapeCount());
            try std.testing.expectEqual(@as(usize, 0), history.stack.undo.items.len);
            try std.testing.expectEqual(@as(usize, 1), history.stack.redo.items.len);
            const unchanged = try session.save(a, .{});
            defer a.free(unchanged.bytes);
            try std.testing.expectEqualSlices(u8, input, unchanged.bytes);
        }
    }
    return error.AllocationFailureSweepIncomplete;
}
