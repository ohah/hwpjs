const std = @import("std");
const writer = @import("created_table_payloads.zig");
const model = @import("../../model/created_table.zig");
const options: writer.Options = .{ .page_break = 1, .repeat_header = true, .cell_spacing = 7, .margins = .{ 1, -2, 3, -4 } };

fn create(a: std.mem.Allocator) !model.Table {
    return model.create(a, 11, 33, try @import("../../model/table_creation_plan.zig").create(2, 3, 101, 17, 6), &.{ 1, 2, 3, 4, 5, 6 }, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 9 }, 6);
}

test "HWP5 created table payload matches literal wire across the zone count boundary" {
    const a = std.testing.allocator;
    var table = try create(a);
    defer table.deinit(a);
    const expected = [_]u8{ 5, 0, 0, 0, 2, 0, 3, 0, 7, 0, 1, 0, 254, 255, 3, 0, 252, 255, 3, 0, 3, 0, 9, 0, 0, 0 };
    for ([_]u32{ 0x050000ff, 0x05000100, 0x05010100 }) |raw| {
        const modern = raw >= 0x05000100;
        const length: usize = if (modern) 26 else 24;
        const bytes = try writer.writeTable(a, &table, .{ .raw = raw }, options, length);
        defer a.free(bytes);
        try std.testing.expectEqualSlices(u8, expected[0..length], bytes);
        const parsed = try @import("../body/table.zig").Table.parse(bytes, .{ .raw = raw });
        try std.testing.expectEqual(@as(u16, 2), parsed.row_count);
        try std.testing.expectEqual(@as(u16, 3), parsed.column_count);
        try std.testing.expectEqual(@as(u16, 3), parsed.rows.get(1).?.size);
        try std.testing.expectEqual(@as(i16, -4), parsed.margins[3]);
        try std.testing.expectEqual(@as(u16, 9), parsed.border_fill_id);
        try std.testing.expectEqual(@as(usize, 0), parsed.extra.len);
        if (modern) try std.testing.expectEqual(@as(usize, 0), parsed.zones.?.count()) else try std.testing.expect(parsed.zones == null);
        try std.testing.expectError(error.LimitExceeded, writer.writeTable(a, &table, .{ .raw = raw }, options, length - 1));
    }
    const cell = try writer.writeCell(&table, 1, 2, .{ 5, -6, 7, -8 });
    const expected_cell = [_]u8{ 2, 0, 1, 0, 1, 0, 1, 0, 33, 0, 0, 0, 17, 0, 0, 0, 5, 0, 250, 255, 7, 0, 248, 255, 9, 0 };
    try std.testing.expectEqualSlices(u8, &expected_cell, &cell);
    const parsed_cell = try @import("../body/table_cell.zig").Cell.parse(&cell);
    try std.testing.expectEqual(@as(u32, 33), parsed_cell.width);
    try std.testing.expectEqual(@as(u16, 1), parsed_cell.column_span);
    try std.testing.expectEqual(@as(i16, -8), parsed_cell.margins[3]);
    var width: u32 = 0;
    for (0..3) |column| {
        const current = try writer.writeCell(&table, 0, @intCast(column), .{ 0, 0, 0, 0 });
        width += (try @import("../body/table_cell.zig").Cell.parse(&current)).width;
    }
    try std.testing.expectEqual(@as(u32, 101), width);
}

test "HWP5 created table payload rejects forged model bounds policy and resource truncation" {
    const a = std.testing.allocator;
    var table = try create(a);
    defer table.deinit(a);
    var forged = table;
    forged.plan.rows = 65536;
    try std.testing.expectError(error.InvalidHwp5TableDimensions, writer.writeTable(a, &forged, .{ .raw = 0x05000100 }, options, 100));
    forged = table;
    forged.plan.columns = 65536;
    try std.testing.expectError(error.InvalidHwp5TableDimensions, writer.writeCell(&forged, 0, 0, .{ 0, 0, 0, 0 }));
    forged = table;
    forged.resources.border_fill = 65536;
    try std.testing.expectError(error.InvalidBorderFillReference, writer.writeCell(&forged, 0, 0, .{ 0, 0, 0, 0 }));
    forged = table;
    forged.cells = forged.cells[0..5];
    try std.testing.expectError(error.LimitExceeded, writer.writeTable(a, &forged, .{ .raw = 0x05000100 }, options, 100));
    var excess: [7]model.Cell = undefined;
    @memcpy(excess[0..6], table.cells);
    excess[6] = .{ .paragraph_id = 7, .text = &.{} };
    forged = table;
    forged.cells = &excess;
    try std.testing.expectError(error.InvalidCreatedTableCells, writer.writeTable(a, &forged, .{ .raw = 0x05000100 }, options, 100));
    var reserved = options;
    reserved.page_break = 3;
    try std.testing.expectError(error.InvalidTableCreationPolicy, writer.writeTable(a, &table, .{ .raw = 0x05000100 }, reserved, 100));
    try std.testing.expectError(error.UnsupportedVersion, writer.writeTable(a, &table, .{ .raw = 0x06000000 }, options, 100));
    try std.testing.expectError(error.InvalidTableCell, writer.writeCell(&table, 2, 0, .{ 0, 0, 0, 0 }));
    try std.testing.expectError(error.InvalidTableCell, writer.writeCell(&table, 0, 3, .{ 0, 0, 0, 0 }));
}

test "HWP5 created table payload failed allocation preserves an independently cloned model" {
    const a = std.testing.allocator;
    var table = try create(a);
    defer table.deinit(a);
    var before = try table.clone(a);
    defer before.deinit(a);
    var failure = std.testing.FailingAllocator.init(a, .{ .fail_index = 0 });
    try std.testing.expectError(error.OutOfMemory, writer.writeTable(failure.allocator(), &table, .{ .raw = 0x05000100 }, options, 26));
    try std.testing.expectEqualDeep(before, table);
}

test "HWP5 created table payload releases every failed allocation and leaves its model unchanged" {
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            var table = try create(a);
            defer table.deinit(a);
            const bytes = try writer.writeTable(a, &table, .{ .raw = 0x05000100 }, options, 26);
            defer a.free(bytes);
            try std.testing.expectEqual(@as(usize, 6), table.cells.len);
            try std.testing.expectEqual(@as(u32, 101), table.plan.width);
            try std.testing.expectEqual(@as(u32, 6), table.cells[5].paragraph_id);
        }
    }.run, .{});
}
