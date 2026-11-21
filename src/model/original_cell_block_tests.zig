const std = @import("std");
const plan = @import("original_cell_block.zig");
const cells = [_]plan.Cell{
    .{ .list_node = 10, .row = 0, .column = 0, .row_span = 1, .column_span = 2, .paragraphs = &.{ 1, 2 } },
    .{ .list_node = 20, .row = 1, .column = 0, .row_span = 1, .column_span = 1, .paragraphs = &.{3} },
    .{ .list_node = 30, .row = 1, .column = 1, .row_span = 1, .column_span = 1, .paragraphs = &.{4} },
};
const witnesses = [_]plan.Witness{
    .{ .list_node = 10, .row = 0, .column = 0, .paragraphs = &.{ 1, 2 } },
    .{ .list_node = 20, .row = 1, .column = 0, .paragraphs = &.{3} },
    .{ .list_node = 30, .row = 1, .column = 1, .paragraphs = &.{4} },
};
const all: plan.Rectangle = .{ .top = 0, .left = 0, .bottom = 2, .right = 2 };
test "original cell block pure merged slots have one source owner and canonical membership" {
    const a = std.testing.allocator;
    const selected = try plan.validate(a, &cells, .{ .rows = 2, .columns = 2, .rectangle = all, .cells = &witnesses });
    defer a.free(selected);
    try std.testing.expectEqualSlices(usize, &.{ 0, 1, 2 }, selected);
    const top = try plan.validate(a, &cells, .{ .rows = 2, .columns = 2, .rectangle = .{ .top = 0, .left = 0, .bottom = 1, .right = 2 }, .cells = witnesses[0..1] });
    defer a.free(top);
    try std.testing.expectEqualSlices(usize, &.{0}, top);
}
test "original cell block pure partial merged outside duplicate forged membership and holes refuse" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.PartialMergedCellBlock, plan.validate(a, &cells, .{ .rows = 2, .columns = 2, .rectangle = .{ .top = 0, .left = 0, .bottom = 1, .right = 1 }, .cells = witnesses[0..1] }));
    try std.testing.expectError(error.InvalidOriginalCellBlock, plan.validate(a, &cells, .{ .rows = 2, .columns = 2, .rectangle = .{ .top = 0, .left = 0, .bottom = 3, .right = 2 }, .cells = &witnesses }));
    var forged = witnesses;
    forged[2] = witnesses[1];
    try std.testing.expectError(error.OriginalCellBlockOwnerMismatch, plan.validate(a, &cells, .{ .rows = 2, .columns = 2, .rectangle = all, .cells = &forged }));
    forged = witnesses;
    forged[0].paragraphs = &.{2};
    try std.testing.expectError(error.OriginalCellBlockOwnerMismatch, plan.validate(a, &cells, .{ .rows = 2, .columns = 2, .rectangle = all, .cells = &forged }));
    var gap = cells;
    gap[0].column_span = 1;
    try std.testing.expectError(error.InvalidOriginalCellBlock, plan.validate(a, &gap, .{ .rows = 2, .columns = 2, .rectangle = all, .cells = &witnesses }));
}
test "original cell block pure overlapping ambiguous source and zero overflow grids refuse" {
    const a = std.testing.allocator;
    var overlap = cells;
    overlap[1].row = 0;
    try std.testing.expectError(error.OverlappingOriginalCellBlock, plan.validate(a, &overlap, .{ .rows = 2, .columns = 2, .rectangle = all, .cells = &witnesses }));
    overlap = cells;
    overlap[2].list_node = 20;
    try std.testing.expectError(error.AmbiguousCellDisplayOwner, plan.validate(a, &overlap, .{ .rows = 2, .columns = 2, .rectangle = all, .cells = &witnesses }));
    try std.testing.expectError(error.InvalidOriginalCellBlock, plan.validate(a, &cells, .{ .rows = 0, .columns = 2, .rectangle = all, .cells = &witnesses }));
    try std.testing.expectError(error.InvalidOriginalCellBlock, plan.validate(a, &cells, .{ .rows = 0xffffffff, .columns = 0xffffffff, .rectangle = all, .cells = &witnesses }));
}
test "original cell block pure checked allocation failures preserve every source witness" {
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            const output = try plan.validate(a, &cells, .{ .rows = 2, .columns = 2, .rectangle = all, .cells = &witnesses });
            defer a.free(output);
            try std.testing.expectEqualSlices(usize, &.{ 0, 1, 2 }, output);
        }
    }.run, .{});
}
