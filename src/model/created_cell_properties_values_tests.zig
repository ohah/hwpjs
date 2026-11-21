const std = @import("std");
const a = std.testing.allocator;
const values = @import("created_cell_properties_values.zig");
const creation = @import("created_table.zig");
const Ticket = @import("history_mutation_epoch.zig").Ticket;
const ticket: Ticket = .{ .binding = .{ .document = 1, .generation = 2, .owner = 3 }, .epoch = 4 };
fn table() !creation.Table {
    return creation.create(a, 17, 19, try @import("table_creation_plan.zig").create(2, 2, 200, 20, 4), &.{ 1, 2, 3, 4 }, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 4);
}
fn request() values.Request {
    return .{ .address = .{ .section = 0, .identity = 17, .row = 0, .column = 1 }, .expected_ticket = ticket, .expected = .{ .width = 100, .height = 20 }, .size = .{ .height = 30 } };
}
test "created cell properties native preparation owns generated identity without changing original table or peer cell" {
    var source = try table();
    defer source.deinit(a);
    const before: values.Values = .{};
    var plan = try values.prepare(a, before, &source, 0, ticket, request(), 4096);
    defer plan.deinit(a);
    try std.testing.expect(plan.changed);
    const selected = try plan.values.observe(&source, request().address);
    try std.testing.expectEqual(@as(u32, 30), selected.frame.height);
    var peer = request().address;
    peer.column = 0;
    try std.testing.expectEqual(@as(u32, 20), (try plan.values.observe(&source, peer)).frame.height);
    try std.testing.expectEqual(@as(u32, 20), source.plan.row_height);
    try std.testing.expectEqual(@as(usize, 0), before.entries.len);
    try plan.revalidate(ticket);
}
test "created cell properties native whole ticket stale dimensions and late budget refuse before publishing" {
    var source = try table();
    defer source.deinit(a);
    const before: values.Values = .{};
    for (0..4) |axis| {
        var wrong = ticket;
        switch (axis) {
            0 => wrong.binding.document += 1,
            1 => wrong.binding.generation += 1,
            2 => wrong.binding.owner += 1,
            else => wrong.epoch += 1,
        }
        if (axis == 3) {
            try std.testing.expectError(error.StaleMutationEpoch, values.prepare(a, before, &source, 0, wrong, request(), 4096));
        } else try std.testing.expectError(error.SourceBindingMismatch, values.prepare(a, before, &source, 0, wrong, request(), 4096));
    }
    var stale = request();
    stale.expected.width += 1;
    try std.testing.expectError(error.StaleCreatedCellProperties, values.prepare(a, before, &source, 0, ticket, stale, 4096));
    try std.testing.expectError(error.LimitExceeded, values.prepare(a, before, &source, 0, ticket, request(), @sizeOf(values.Entry) - 1));
    try std.testing.expectEqual(@as(usize, 0), before.entries.len);
}
test "created cell properties native sparse appearance preserves omitted edges and solid foreground through clone" {
    var source = try table();
    defer source.deinit(a);
    var first = request();
    first.size = .{};
    first.appearance = .{ .background = .{ .hatch = .{ .face = 0x123456, .hatch = 0xabcdef, .style = .CROSS } } };
    first.appearance.border.edges[0] = .{ .style = .SOLID, .width_hundredth_mm = 10, .color = 0x112233 };
    var old = try values.prepare(a, .{}, &source, 0, ticket, first, 4096);
    defer old.deinit(a);
    var next = request();
    next.size = .{};
    next.appearance = .{ .background = .{ .solid = .{ .color = 0x334455 } } };
    var plan = try values.prepare(a, old.values, &source, 0, ticket, next, 4096);
    defer plan.deinit(a);
    const selected = try plan.values.observe(&source, next.address);
    try std.testing.expectEqual(@as(u32, 0x112233), selected.appearance.border.edges[0].?.color.?);
    try std.testing.expectEqual(@as(u32, 0xabcdef), selected.appearance.background.?.solid.hatch_color.?);
    var cloned = try plan.values.clone(a);
    defer cloned.deinit(a);
    cloned.entries[0].frame.height = 99;
    try std.testing.expectEqual(@as(u32, 20), plan.values.entries[0].frame.height);
}
