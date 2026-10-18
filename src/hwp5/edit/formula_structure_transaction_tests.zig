const std = @import("std");
const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;

fn sweep(merge: bool, paragraph: usize) !void {
    try @import("../../testing/checked_allocator.zig").run(sweepChecked, .{ merge, paragraph });
}

fn sweepChecked(a: std.mem.Allocator, merge: bool, paragraph: usize) !void {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwp", a, .limited(4_000_000));
    defer a.free(input);
    for (0..50_000) |index| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const session = try edit.Session.open(failing.allocator(), input);
        defer session.close();
        if (merge) try session.apply(.{ .split_paragraph = .{ .section = 0, .paragraph = paragraph, .at_unit = 2 } });
        const baseline = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(baseline.bytes);
        var history = try History.init(failing.allocator(), session, 4, 8_000_000);
        defer history.deinit();
        try std.testing.expect(try history.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = paragraph, .start_unit = 0, .end_unit = 0, .utf8 = "Old" } }));
        const old = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(old.bytes);
        try std.testing.expect(try history.undo(session));
        const command: edit.Command = if (merge) .{ .merge_paragraph = .{ .section = 0, .paragraph = paragraph } } else .{ .split_paragraph = .{ .section = 0, .paragraph = paragraph, .at_unit = 2 } };
        failing.fail_index = failing.alloc_index + index;
        const result = history.apply(session, command);
        failing.fail_index = std.math.maxInt(usize);
        if (result) |changed| {
            try std.testing.expect(changed);
            try std.testing.expect(!try history.redo(session));
            try std.testing.expect(try history.undo(session));
            try std.testing.expect(!try history.undo(session));
            const restored = try session.save(a, .{ .allow_stale_layout = true });
            defer a.free(restored.bytes);
            try std.testing.expectEqualSlices(u8, baseline.bytes, restored.bytes);
            if (!failing.has_induced_failure) {
                std.debug.print("HWP5 formula structure allocation points (merge={any}, paragraph={d}): {d}\n", .{ merge, paragraph, index });
                return;
            }
        } else |err| {
            try std.testing.expectEqual(error.OutOfMemory, err);
            try std.testing.expect(!try history.undo(session));
            const restored = try session.save(a, .{ .allow_stale_layout = true });
            defer a.free(restored.bytes);
            try std.testing.expectEqualSlices(u8, baseline.bytes, restored.bytes);
            try std.testing.expect(try history.redo(session));
            const redone = try session.save(a, .{ .allow_stale_layout = true });
            defer a.free(redone.bytes);
            try std.testing.expectEqualSlices(u8, old.bytes, redone.bytes);
        }
    }
    return error.AllocationFailureSweepIncomplete;
}

test "formula body structure split allocation failures preserve original and prior redo" {
    try sweep(false, 1);
}

test "formula body structure merge allocation failures preserve split and prior redo" {
    try sweep(true, 1);
}

test "formula cell structure split allocation failures preserve original and prior redo" {
    try sweep(false, 12);
}

test "formula cell structure merge allocation failures preserve split and prior redo" {
    try sweep(true, 12);
}
