const std = @import("std");
const model = @import("../../model/created_table.zig");
const Value = @import("created_table_value.zig").Value;
const records = @import("created_table_records.zig");

fn exercise(a: std.mem.Allocator) !void {
    var table = try model.create(a, 1, 2, try @import("../../model/table_creation_plan.zig").create(1, 1, 100, 20, 1), &.{3}, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 1);
    defer table.deinit(a);
    _ = try table.replaceText(a, 0, 0, "셀😀", 100);
    var description = [_]u8{ 'a', 'b', 'c' };
    var options: records.Options = .{
        .common = .{ .flags = 0x6a2211, .offset_x = 3, .offset_y = -4, .z_order = 7, .margins = .{ 1, 2, 3, 4 }, .prevent_page_break = false, .description = &description },
        .table = .{ .page_break = 1, .repeat_header = false, .cell_spacing = 0, .margins = .{ 0, 0, 0, 0 } },
        .cell = .{ .layout = .observed8, .unknown = 0, .attributes = 0, .margins = .{ 0, 0, 0, 0 } },
    };
    const size = try Value.ownedSize(&table, options);
    try std.testing.expectError(error.LimitExceeded, Value.initClone(a, &table, options, size - 1));
    var value = try Value.initClone(a, &table, options, size);
    defer value.deinit(a);
    const resources: records.Resources = .{ .paragraphs = .{ .char_shapes = 1, .para_shapes = 1, .styles = 1 }, .border_count = 1 };
    const limits: records.Limits = .{ .max_cells = 1, .max_bytes = 4096 };
    const before = try records.write(a, &value.table, .{ .raw = 0x05000302 }, value.options, resources, 1, limits);
    defer a.free(before);
    description[0] = 'z';
    options.common.offset_x = 99;
    _ = try table.replaceText(a, 0, 0, "changed", 100);
    try std.testing.expectEqualStrings("abc", value.options.common.description);
    try std.testing.expectEqual(@as(i32, 3), value.options.common.offset_x);
    try std.testing.expectEqualStrings("셀😀", value.table.cells[0].text);
    const after = try records.write(a, &value.table, .{ .raw = 0x05000302 }, value.options, resources, 1, limits);
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    var copy = try value.clone(a, size);
    defer copy.deinit(a);
    try std.testing.expect(copy.options.common.description.ptr != value.options.common.description.ptr);
    try std.testing.expect(copy.table.cells.ptr != value.table.cells.ptr);
    try std.testing.expect(copy.table.cells[0].text.ptr != value.table.cells[0].text.ptr);
    // All three clone allocations may fail; the live value stays usable.
    for (0..3) |index| {
        var failure = std.testing.FailingAllocator.init(a, .{ .fail_index = index });
        try std.testing.expectError(error.OutOfMemory, value.clone(failure.allocator(), size));
        try std.testing.expectEqual(failure.allocated_bytes, failure.freed_bytes);
        try std.testing.expectEqualStrings("abc", value.options.common.description);
        try std.testing.expectEqualStrings("셀😀", value.table.cells[0].text);
    }
    _ = try copy.table.replaceText(a, 0, 0, "redo", 100);
    try std.testing.expectEqualStrings("셀😀", value.table.cells[0].text);
    var invalid = options;
    invalid.common.description = &.{255};
    try std.testing.expectError(error.InvalidObjectDescription, Value.initClone(a, &table, invalid, 4096));
}

test "HWP5 new table native value owns options and cells with exact budgets and every allocation failure" {
    try exercise(std.testing.allocator);
    try @import("../../testing/allocation_failures.zig").check(exercise, .{});
}
