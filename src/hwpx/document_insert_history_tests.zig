const std = @import("std");
const editor = @import("editor_session.zig");
const History = @import("editor_history.zig").History;
const Command = @import("editor_history.zig").Command;
const authored = @import("../new_document/hwpx.zig");

test "HWPX document insertion history allocation failures preserve revision redo and save" {
    const a = std.testing.allocator;
    const original = try authored.create(a);
    defer a.free(original);
    const probes = [_]usize{ 0, 1, 2, 3, 4, 8, 12, 16, 24, 32, 48, 64, 96 };
    var successful_allocations: usize = 0;
    for (0..probes.len + 4) |index| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const alloc = failing.allocator();
        var session = try editor.open(alloc, original, .{});
        defer session.deinit();
        session.history_delta_managed = true;
        var history = try History.initV2(&session, .{});
        defer history.deinit();
        try std.testing.expect(try history.apply(&session, .{ .paragraph = 1, .start = 0, .deleted = 0, .inserted = "AB" }));
        try std.testing.expect(try history.apply(&session, .{ .paragraph = 1, .start = 2, .deleted = 0, .inserted = "C" }));
        try std.testing.expect(try history.undo(&session));
        const before = try session.save();
        defer alloc.free(before);
        const serial = session.mutation_serial;
        const revision = history.revision();
        const pointer = session.source.ptr;
        const start = failing.alloc_index;
        const command: Command = .{ .kind = .insert_document, .paragraph = 1, .start = 1, .deleted = 0, .inserted = original };
        if (index == 0) {
            try std.testing.expect(try history.apply(&session, command));
            const allocations = failing.alloc_index - start;
            successful_allocations = allocations;
            std.debug.print("document insertion command allocation checkpoints={d}\n", .{allocations});
            try std.testing.expect(allocations > probes[probes.len - 1]);
            continue;
        }
        const offset = if (index <= probes.len) probes[index - 1] else successful_allocations - (probes.len + 4 - index);
        failing.fail_index = start + offset;
        const result = history.apply(&session, command);
        failing.fail_index = std.math.maxInt(usize);
        try std.testing.expectError(error.OutOfMemory, result);
        try std.testing.expectEqual(revision, history.revision());
        try std.testing.expectEqual(serial, session.mutation_serial);
        try std.testing.expectEqual(pointer, session.source.ptr);
        const after = try session.save();
        defer alloc.free(after);
        try std.testing.expectEqualSlices(u8, before, after);
        try std.testing.expect(try history.redo(&session));
        const text = try session.anchorText(0, 1);
        defer alloc.free(text);
        try std.testing.expectEqualStrings("ABC", text);
    }
}
