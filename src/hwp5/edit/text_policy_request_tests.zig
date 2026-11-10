//! Request-local unselected SSOT contract; constructor bytes only.
const std = @import("std");
const a = std.testing.allocator;
const policy = @import("text_source_policy.zig");
const Version = @import("../version.zig").Version;
const version: Version = .{ .raw = 0x05000107 };
const Ticket = @import("../../model/history_mutation_epoch.zig").Ticket;
const ticket: Ticket = .{ .binding = .{ .document = 1, .generation = 1, .owner = 9 }, .epoch = 0 };
const good = [_]u8{ 68, 0, 0x80, 0, 0, 0, 0, 0, 0, 0, 0, 0 };
const unknown = [_]u8{ 0xe8, 3, 0, 0 };
const control = [_]u8{ 71, 0, 0x40, 0, 'x', 'x', 'x', 'x' };
const truncated = [_]u8{ 71, 0, 0, 0 };
const name = [_]u8{ 71, 0, 0x40, 0, 'm', 'k', 'o', 'b', 87, 4, 0xe0, 0, 0x1b, 2, 1, 0, 0, 0, 0, 0x40, 1, 0, 1, 0, 0x41, 0 };

test "H5 text policy request exact lazy error order all small section and selection families" {
    const kinds = [_][]const u8{ &good, &unknown, &control, &truncated };
    var owner: u8 = 0;
    var comparisons: usize = 0;
    for (0..64) |code| {
        const sources = [_][]const u8{ kinds[code % 4], kinds[code / 4 % 4], kinds[code / 16 % 4] };
        for (0..27) |order| {
            const context = try policy.UnselectedContext.create(a, &owner, &sources, version, ticket);
            defer context.destroy();
            var digits = order;
            for (0..3) |_| {
                const selected = digits % 3;
                digits /= 3;
                if (policy.validateUnselected(a, &sources, version, selected)) |_| {
                    try context.validate(&owner, &sources, version, ticket, selected);
                } else |err| {
                    try std.testing.expectError(err, context.validate(&owner, &sources, version, ticket, selected));
                }
                comparisons += 1;
            }
        }
    }
    try std.testing.expectEqual(@as(usize, 5184), comparisons);
    std.debug.print("H5 policy lazy differential {d} old/scoped outcomes (64 source families *27 selection sequences *3 steps)\n", .{comparisons});
}
test "H5 text policy request identity owner list version epoch and selected slot reject" {
    var owner: u8 = 0;
    var foreign: u8 = 0;
    var sources = [_][]const u8{ &good, &good, &good };
    const context = try policy.UnselectedContext.create(a, &owner, &sources, version, ticket);
    defer context.destroy();
    try context.validate(&owner, &sources, version, ticket, 1);
    try context.validate(&owner, &sources, version, ticket, 0);
    try std.testing.expectError(error.SourceBindingMismatch, context.validate(&foreign, &sources, version, ticket, 0));
    try std.testing.expectError(error.SourceBindingMismatch, context.validate(&owner, &sources, .{ .raw = version.raw + 1 }, ticket, 0));
    var moved = ticket;
    moved.epoch += 1;
    try std.testing.expectError(error.SourceBindingMismatch, context.validate(&owner, &sources, version, moved, 0));
    moved = ticket;
    moved.binding.generation += 1;
    try std.testing.expectError(error.SourceBindingMismatch, context.validate(&owner, &sources, version, moved, 0));
    const alternate = sources;
    try std.testing.expectError(error.SourceBindingMismatch, context.validate(&owner, &alternate, version, ticket, 0));
    try std.testing.expectError(error.SourceBindingMismatch, context.validate(&owner, sources[0..2], version, ticket, 0));
    const replacement = try a.dupe(u8, &good);
    defer a.free(replacement);
    sources[2] = replacement;
    try std.testing.expectError(error.SourceBindingMismatch, context.validate(&owner, &sources, version, ticket, 2));
    sources[2] = &good;
    try std.testing.expectError(error.InvalidSection, context.validate(&owner, &sources, version, ticket, 3));
}
test "H5 text policy request preserves previously excluded late source error and all unselected guards" {
    var owner: u8 = 0;
    const sources = [_][]const u8{ &unknown, &good, &control };
    const context = try policy.UnselectedContext.create(a, &owner, &sources, version, ticket);
    defer context.destroy();
    // Excluding source0 must still find the bad never-selected source2.
    try std.testing.expectError(error.UnsupportedSectionControl, context.validate(&owner, &sources, version, ticket, 0));
    // Earliest bad source0 wins for selection1 even after a prior failed pass.
    try std.testing.expectError(error.UnsupportedSectionRecord, context.validate(&owner, &sources, version, ticket, 1));
    const late = [_][]const u8{ &unknown, &good, &good };
    const late_context = try policy.UnselectedContext.create(a, &owner, &late, version, ticket);
    defer late_context.destroy();
    try late_context.validate(&owner, &late, version, ticket, 0);
    try std.testing.expectError(error.UnsupportedSectionRecord, late_context.validate(&owner, &late, version, ticket, 2));
    try late_context.validate(&owner, &late, version, ticket, 0);
    try std.testing.expectError(error.UnsupportedSectionRecord, late_context.validate(&owner, &late, version, ticket, 1));
}
test "H5 text policy request OOM constructor and second pass cannot cache partial acceptance" {
    var owner: u8 = 0;
    const sources = [_][]const u8{ &name, &good };
    for (0..2) |index| {
        var failing = std.testing.FailingAllocator.init(a, .{ .fail_index = index });
        try std.testing.expectError(error.OutOfMemory, policy.UnselectedContext.create(failing.allocator(), &owner, &sources, version, ticket));
    }
    var no_resize: @import("../../testing/no_resize_allocator.zig").NoResize = .{ .backing = a };
    var measured = std.testing.FailingAllocator.init(no_resize.allocator(), .{});
    const success = try policy.UnselectedContext.create(measured.allocator(), &owner, &sources, version, ticket);
    defer success.destroy();
    try success.validate(&owner, &sources, version, ticket, 0);
    const initial = measured.alloc_index;
    try success.validate(&owner, &sources, version, ticket, 1);
    const count = measured.alloc_index - initial;
    try std.testing.expect(count > 0);
    for (0..count) |index| {
        var failing = std.testing.FailingAllocator.init(no_resize.allocator(), .{});
        const context = try policy.UnselectedContext.create(failing.allocator(), &owner, &sources, version, ticket);
        defer context.destroy();
        try context.validate(&owner, &sources, version, ticket, 0);
        failing.fail_index = failing.alloc_index + index;
        try std.testing.expectError(error.OutOfMemory, context.validate(&owner, &sources, version, ticket, 1));
        failing.fail_index = std.math.maxInt(usize);
        var work: policy.Work = .{};
        policy.Testing.watch(&work);
        {
            defer policy.Testing.unwatch();
            try context.validate(&owner, &sources, version, ticket, 1);
        }
        try std.testing.expectEqual(@as(usize, 1), work.policy_calls);
        try context.validate(&owner, &sources, version, ticket, 0);
    }
    std.debug.print("H5 policy lazy completion OOM {d}/{d} allocation positions +2 constructor failures\n", .{ count, count });
}
