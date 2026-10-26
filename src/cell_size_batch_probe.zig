test {
    _ = @import("wasm/cell_size_batch.zig");
}

test "HWPX cell size batch actual history rolls back every allocation failure" {
    const std = @import("std");
    const editor = @import("hwpx/editor_session.zig");
    const histories = @import("hwpx/editor_history.zig");
    const bindings = @import("hwpx/table_display_bindings.zig");
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwpx", std.testing.allocator, .limited(4_000_000));
    defer std.testing.allocator.free(input);
    try @import("testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator, bytes: []const u8) !void {
            var session = try editor.open(a, bytes, .{});
            defer session.deinit();
            var history = try histories.History.init(&session, 4, 4_000_000);
            defer history.deinit();
            const original = try bindings.read(a, &session, 0);
            defer a.free(original);
            const left = original[0].owner;
            const right = original[original.len - 1].owner;
            try std.testing.expect(left.list_node != right.list_node);
            const commands = [_]histories.Command{
                .{ .kind = .cell_size, .section = 0, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .list_node = left.list_node, .cell_size = .{ .width = left.cell.width.? + 100, .height = left.cell.height.? } },
                .{ .kind = .cell_size, .section = 0, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .list_node = right.list_node, .cell_size = .{ .width = right.cell.width.? + 100, .height = right.cell.height.? } },
            };
            const changed = history.applyBatch(&session, &commands) catch |err| {
                // Read-only save with an independent allocator: the injected
                // allocator may continue refusing allocations after the error.
                var readable = session;
                readable.allocator = std.testing.allocator;
                const restored = try readable.save();
                defer std.testing.allocator.free(restored);
                try std.testing.expectEqualSlices(u8, bytes, restored);
                const current = try bindings.read(std.testing.allocator, &session, 0);
                defer std.testing.allocator.free(current);
                try std.testing.expectEqualDeep(original, current);
                return err;
            };
            try std.testing.expect(changed);
            const current = try bindings.read(a, &session, 0);
            defer a.free(current);
            try std.testing.expectEqual(left.cell.width.? + 100, current[0].owner.cell.width.?);
            try std.testing.expectEqual(right.cell.width.? + 100, current[current.len - 1].owner.cell.width.?);
            try std.testing.expect(try history.undo(&session));
            const restored = try session.save();
            defer a.free(restored);
            try std.testing.expectEqualSlices(u8, bytes, restored);
            try std.testing.expect(!try history.undo(&session));
        }
    }.run, .{input});
}

test "HWP5 cell size batch actual history rolls back every allocation failure" {
    const std = @import("std");
    const edit = @import("hwp5/edit/style_preservation.zig");
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwp", std.testing.allocator, .limited(4_000_000));
    defer std.testing.allocator.free(input);
    try @import("testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator, bytes: []const u8) !void {
            const session = try edit.Session.open(a, bytes);
            defer session.close();
            var history = try @import("hwp5/edit/editor_history.zig").History.init(a, session, 4, 4_000_000);
            defer history.deinit();
            const bindings = try session.tableBindings(a, 0);
            defer a.free(bindings);
            const left = bindings[0];
            const right = bindings[bindings.len - 1];
            const commands = [_]edit.Command{
                .{ .set_cell_size = .{ .section = 0, .list_node = left.list_node, .width = left.width + 100, .height = left.height } },
                .{ .set_cell_size = .{ .section = 0, .list_node = right.list_node, .width = right.width + 100, .height = right.height } },
            };
            const changed = history.applyBatch(session, &commands) catch |err| {
                const restored = try session.save(std.testing.allocator, .{});
                defer std.testing.allocator.free(restored.bytes);
                try std.testing.expectEqualSlices(u8, bytes, restored.bytes);
                return err;
            };
            try std.testing.expect(changed);
            const current = try session.tableBindings(a, 0);
            defer a.free(current);
            try std.testing.expectEqual(left.width + 100, current[0].width);
            try std.testing.expectEqual(right.width + 100, current[current.len - 1].width);
            try std.testing.expect(try history.undo(session));
            const restored = try session.save(a, .{});
            defer a.free(restored.bytes);
            try std.testing.expectEqualSlices(u8, bytes, restored.bytes);
            try std.testing.expect(!try history.undo(session));
        }
    }.run, .{input});
}
