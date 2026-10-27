const std = @import("std");
const fixture = @import("../model/history_stack_ssot_test_entry.zig");
const E = fixture.Entry;
const Owner = fixture.Owner;
const policy = @import("../model/history_policy.zig");
const S = @import("history_state_stack.zig").Stack(E);

fn scenario(a: std.mem.Allocator) !void {
    const initial = try E.create(a, 2);
    const s = S.create(a, try policy.resolve(.{ .max_entries = 3 }), initial) catch |err| {
        initial.deinit();
        return err;
    };
    defer s.deinit();
    const owner = try Owner.create(a, 7);
    var owner_pending = true;
    defer if (owner_pending) owner.deinit();
    const next = try E.create(a, 3);
    var next_pending = true;
    defer if (next_pending) next.deinit();
    const before = s.retained_bytes;
    const plan = try s.planUpgrade(next, owner);
    try std.testing.expectEqual(before, s.retained_bytes);
    try std.testing.expect(initial.checkpoint == null and owner.retained_by == null);
    try s.commit(plan);
    owner_pending = false;
    next_pending = false;
    try std.testing.expect(initial.checkpoint == owner and owner.retained_by == @as(*const anyopaque, @ptrCast(initial)));
    try std.testing.expectEqual(s.retained_bytes, s.recount());
    var restore: fixture.Restore = .{};
    try std.testing.expect(try s.move(false, &restore, fixture.Restore.apply));
    try std.testing.expect(try s.move(true, &restore, fixture.Restore.apply));
    try std.testing.expectEqual(s.retained_bytes, s.recount());
}
test "stack ssot HX deferred owner attaches exactly once after a successful plan" {
    try scenario(std.testing.allocator);
}
test "stack ssot HX already attached and foreign owner are rejected atomically" {
    const a = std.testing.allocator;
    const initial = try E.create(a, 1);
    const s = S.create(a, try policy.resolve(.{}), initial) catch |err| {
        initial.deinit();
        return err;
    };
    defer s.deinit();
    const next = try E.create(a, 1);
    defer next.deinit();
    const owner = try Owner.create(a, 4);
    defer owner.deinit();
    owner.retained_by = next;
    const before = s.retained_bytes;
    try std.testing.expectError(error.CheckpointAlreadyRetained, s.planUpgrade(next, owner));
    try std.testing.expectEqual(before, s.retained_bytes);
    try std.testing.expect(initial.checkpoint == null and next.retained_by == null);
    owner.retained_by = null;
    const attached = try E.create(a, 1);
    const existing_owner = Owner.create(a, 2) catch |err| {
        attached.deinit();
        return err;
    };
    attached.attach(existing_owner);
    const other = S.create(a, try policy.resolve(.{}), attached) catch |err| {
        attached.deinit();
        return err;
    };
    defer other.deinit();
    try std.testing.expectError(error.CheckpointAlreadyRetained, other.planUpgrade(next, owner));
}
test "stack ssot HX upgrade cannot silently exceed current entry owned cap" {
    const a = std.testing.allocator;
    const initial = try E.create(a, 1);
    const cap: u32 = @intCast(initial.ownedBytes());
    const s = S.create(a, try policy.resolve(.{ .max_checkpoint_owned_bytes = cap }), initial) catch |err| {
        initial.deinit();
        return err;
    };
    defer s.deinit();
    const next = try E.create(a, 1);
    defer next.deinit();
    const owner = try Owner.create(a, 1);
    defer owner.deinit();
    try std.testing.expectError(error.HistoryEntryOwnedLimitExceeded, s.planUpgrade(next, owner));
    try std.testing.expect(initial.checkpoint == null and owner.retained_by == null);
}
test "stack ssot HX tiny creation plan upgrade cleanup full allocation failure control" {
    try @import("../testing/allocation_failures.zig").check(scenario, .{});
}
