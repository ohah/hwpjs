const std = @import("std");
const editor = @import("editor_session.zig");
const history = @import("editor_history.zig");

test "HWPX deferred underline batch save failure restores source resources and redo" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var h = try history.History.init(&session, 8, 4_000_000);
    defer h.deinit();
    const commands = [_]history.Command{
        .{ .kind = .character_properties, .paragraph = 2, .start = 0, .deleted = 1, .inserted = "", .character_properties = .{ .underline_kind = .bottom } },
        .{ .kind = .character_properties, .paragraph = 3, .start = 0, .deleted = 1, .inserted = "", .character_properties = .{ .underline_kind = .bottom } },
    };
    try std.testing.expect(try h.applyBatch(&session, &commands));
    const expected = try session.save();
    defer a.free(expected);
    try std.testing.expect(try h.undo(&session));
    const resources = session.character_resources.entries.items.len;
    const original_limit = session.options.max_output_bytes;
    session.options.max_output_bytes = 1;
    try std.testing.expectError(error.LimitExceeded, h.applyBatch(&session, &commands));
    session.options.max_output_bytes = original_limit;
    try std.testing.expectEqual(resources, session.character_resources.entries.items.len);
    try std.testing.expectEqual(@as(usize, 0), h.stack.undo.items.len);
    try std.testing.expectEqual(@as(usize, 1), h.stack.redo.items.len);
    const unchanged = try session.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, input, unchanged);
    try std.testing.expect(try h.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, expected, redone);
}

test "HWPX underline allocation profile separates checkpoints edits and saving" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var counter = std.testing.FailingAllocator.init(a, .{});
    var session = try editor.open(counter.allocator(), input, .{});
    defer session.deinit();
    var baseline = counter.alloc_index;
    var checkpoint = try @import("editor_checkpoint.zig").capture(&session, 4_000_000);
    defer checkpoint.deinit();
    const checkpoint_allocations = counter.alloc_index - baseline;
    baseline = counter.alloc_index;
    try std.testing.expect(try session.setCharacterProperties(0, 2, 0, 1, .{ .underline_kind = .bottom }));
    const first_allocations = counter.alloc_index - baseline;
    baseline = counter.alloc_index;
    try std.testing.expect(try session.setCharacterProperties(0, 3, 0, 1, .{ .underline_kind = .bottom }));
    const second_allocations = counter.alloc_index - baseline;
    baseline = counter.alloc_index;
    const saved = try session.save();
    defer counter.allocator().free(saved);
    const save_allocations = counter.alloc_index - baseline;
    std.debug.print("underline allocation profile checkpoint={d} first={d} second={d} save={d}\n", .{ checkpoint_allocations, first_allocations, second_allocations, save_allocations });
    try checkpoint.rollback(&session);
    const restored = try session.save();
    defer counter.allocator().free(restored);
    try std.testing.expectEqualSlices(u8, input, restored);
    var h = try history.History.init(&session, 8, 4_000_000);
    defer h.deinit();
    const batch_commands = [_]history.Command{
        .{ .kind = .character_properties, .paragraph = 2, .start = 0, .deleted = 1, .inserted = "", .character_properties = .{ .underline_kind = .bottom } },
        .{ .kind = .character_properties, .paragraph = 3, .start = 0, .deleted = 1, .inserted = "", .character_properties = .{ .underline_kind = .bottom } },
    };
    baseline = counter.alloc_index;
    try std.testing.expect(try h.applyBatch(&session, &batch_commands));
    std.debug.print("underline validated batch allocations: {d}\n", .{counter.alloc_index - baseline});
    const batch_saved = try session.save();
    defer counter.allocator().free(batch_saved);
    try std.testing.expectEqualSlices(u8, saved, batch_saved);
}

test "HWPX underline batch allocation failures preserve original and prior redo" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", std.testing.allocator, .limited(4_000_000));
    defer std.testing.allocator.free(input);
    // Keep every failure point and leak/safety checks, without retaining a
    // successful-allocation stack trace for each replay allocation.
    var backing: std.heap.DebugAllocator(.{ .stack_trace_frames = 0 }) = .init;
    defer std.testing.expect(backing.deinit() == .ok) catch @panic("underline exhaustive backing leaked");
    try verifyUnderlineFailures(backing.allocator(), input, false);
}

test "HWPX underline batch spread failure diagnostics retain source redo and release memory" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var backing: std.heap.DebugAllocator(.{ .stack_trace_frames = 0 }) = .init;
    defer std.testing.expect(backing.deinit() == .ok) catch @panic("underline diagnostic backing leaked");
    try verifyUnderlineFailures(backing.allocator(), input, true);
}

// Both modes use identical commands and failure/success invariants. The spread
// diagnostic complements the exhaustive default; it never replaces that gate.
fn verifyUnderlineFailures(a: std.mem.Allocator, input: []const u8, spread: bool) !void {
    var failing = std.testing.FailingAllocator.init(a, .{});
    var session = try editor.open(failing.allocator(), input, .{});
    defer session.deinit();
    var h = try history.History.init(&session, 8, 4_000_000);
    defer h.deinit();
    const commands = [_]history.Command{
        .{ .kind = .character_properties, .paragraph = 2, .start = 0, .deleted = 1, .inserted = "", .character_properties = .{ .underline_kind = .bottom } },
        .{ .kind = .character_properties, .paragraph = 3, .start = 0, .deleted = 1, .inserted = "", .character_properties = .{ .underline_kind = .bottom } },
    };
    try std.testing.expect(try h.applyBatch(&session, &commands));
    const expected = try session.save();
    defer failing.allocator().free(expected);
    try std.testing.expect(try h.undo(&session));
    const allocation_start = failing.alloc_index;
    try std.testing.expect(try h.applyBatch(&session, &commands));
    const transaction_allocations = failing.alloc_index - allocation_start;
    try std.testing.expect(try h.undo(&session));
    std.debug.print("underline batch transaction allocations: {d}\n", .{transaction_allocations});
    const attempts = if (spread) @as(usize, 9) else transaction_allocations + 1;
    var successful = false;
    for (0..attempts) |ordinal| {
        const index = if (spread) transaction_allocations * ordinal / (attempts - 1) else ordinal;
        if (!spread and ordinal % 1024 == 0) std.debug.print("underline exhaustive failure point {d}/{d}\n", .{ ordinal, transaction_allocations });
        failing.fail_index = failing.alloc_index + index;
        const result = h.applyBatch(&session, &commands);
        failing.fail_index = std.math.maxInt(usize);
        if (result) |changed| {
            try std.testing.expect(changed);
            try std.testing.expectEqual(@as(usize, 1), h.stack.undo.items.len);
            try std.testing.expectEqual(@as(usize, 0), h.stack.redo.items.len);
            const saved = try session.save();
            defer failing.allocator().free(saved);
            try std.testing.expectEqualSlices(u8, expected, saved);
            try std.testing.expect(try h.undo(&session));
            const restored = try session.save();
            defer failing.allocator().free(restored);
            try std.testing.expectEqualSlices(u8, input, restored);
            if (!spread) return;
            successful = true;
        } else |err| {
            try std.testing.expectEqual(error.OutOfMemory, err);
            try std.testing.expectEqual(@as(usize, 0), h.stack.undo.items.len);
            try std.testing.expectEqual(@as(usize, 1), h.stack.redo.items.len);
            const unchanged = try session.save();
            defer failing.allocator().free(unchanged);
            try std.testing.expectEqualSlices(u8, input, unchanged);
        }
    }
    if (spread and successful) {
        std.debug.print("underline spread diagnostics: {d} points checked\n", .{attempts});
        return;
    }
    return error.AllocationFailureSweepIncomplete;
}

test "HWPX history batch small two paragraph transaction survives every allocation failure" {
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A</p:t></p:run></p:p><p:p><p:run><p:t>B</p:t></p:run></p:p></s:sec>";
            var session = try @import("editor_history_test_fixture.zig").open(a, xml, 2);
            defer session.deinit();
            var h = try history.History.init(&session, 4, 10000);
            defer h.deinit();
            const commands = [_]history.Command{
                .{ .paragraph = 1, .start = 0, .deleted = 0, .inserted = "한😀" },
                .{ .paragraph = 2, .start = 0, .deleted = 0, .inserted = "둘" },
            };
            _ = h.applyBatch(&session, &commands) catch |err| {
                try std.testing.expectEqualStrings("A", session.sections[0].sites.items[0].text);
                try std.testing.expectEqualStrings("B", session.sections[0].sites.items[1].text);
                try std.testing.expectEqual(@as(usize, 0), h.stack.undo.items.len);
                try std.testing.expectEqual(@as(usize, 0), h.stack.redo.items.len);
                return err;
            };
            try std.testing.expectEqualStrings("한😀A", session.sections[0].sites.items[0].text);
            try std.testing.expectEqualStrings("둘B", session.sections[0].sites.items[1].text);
            try std.testing.expectEqual(@as(usize, 1), h.stack.undo.items.len);
        }
    }.run, .{});
}

test "HWPX history batch commits two paragraphs once and restores prior redo after a late refusal" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var h = try history.History.init(&session, 8, 4_000_000);
    defer h.deinit();
    const commands = [_]history.Command{
        .{ .kind = .character_properties, .paragraph = 1, .start = 0, .deleted = 1, .inserted = "", .character_properties = .{ .underline_color = 0x123456 } },
        .{ .kind = .character_properties, .paragraph = 2, .start = 0, .deleted = 1, .inserted = "", .character_properties = .{ .size = 2400, .bold = true } },
    };
    try std.testing.expect(!try h.applyBatch(&session, &.{}));
    try std.testing.expect(try h.applyBatch(&session, &commands));
    const saved = try session.save();
    defer a.free(saved);
    // 같은 속성을 다시 적용한 묶음은 이력 항목을 추가하지 않습니다.
    try std.testing.expect(!try h.applyBatch(&session, &commands));
    try std.testing.expectEqual(@as(usize, 1), h.stack.undo.items.len);
    try std.testing.expect(try h.undo(&session));
    try std.testing.expect(!try h.undo(&session));
    try std.testing.expect(!try h.applyBatch(&session, &.{}));
    try std.testing.expectEqual(@as(usize, 1), h.stack.redo.items.len);
    const original = try session.save();
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, input, original);
    var invalid = commands;
    invalid[1].character_properties.size = -1;
    try std.testing.expectError(error.InvalidCharacterSize, h.applyBatch(&session, &invalid));
    const unchanged = try session.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, input, unchanged);
    try std.testing.expectEqual(@as(usize, 0), h.stack.undo.items.len);
    try std.testing.expectEqual(@as(usize, 1), h.stack.redo.items.len);
    try std.testing.expect(try h.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
    try std.testing.expect(try h.undo(&session));
    h.max_checkpoint_bytes = try @import("editor_checkpoint.zig").size(&session, std.math.maxInt(usize));
    try std.testing.expectError(error.LimitExceeded, h.applyBatch(&session, &commands));
    const budget_restored = try session.save();
    defer a.free(budget_restored);
    try std.testing.expectEqualSlices(u8, input, budget_restored);
    try std.testing.expectEqual(@as(usize, 0), h.stack.undo.items.len);
    try std.testing.expectEqual(@as(usize, 1), h.stack.redo.items.len);
}
