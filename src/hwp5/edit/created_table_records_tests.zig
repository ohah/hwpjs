const std = @import("std");
const records = @import("created_table_records.zig");
const model = @import("../../model/created_table.zig");
const options: records.Options = .{
    .common = .{ .flags = 0x6a2211, .offset_y = -835, .offset_x = 27, .z_order = -2, .margins = .{ 1, 2, 3, 4 }, .prevent_page_break = false, .description = "새 표😀" },
    .table = .{ .page_break = 1, .repeat_header = false, .cell_spacing = 0, .margins = .{ 0, 0, 0, 0 } },
    .cell = .{ .layout = .observed8, .unknown = 0, .attributes = 0, .margins = .{ 0, 0, 0, 0 } },
};
const resources: records.Resources = .{ .paragraphs = .{ .char_shapes = 8, .para_shapes = 4, .styles = 4 }, .border_count = 10 };
const limits: records.Limits = .{ .max_cells = 6, .max_bytes = 4096 };

fn create(a: std.mem.Allocator) !model.Table {
    var table = try model.create(a, 11, 33, try @import("../../model/table_creation_plan.zig").create(2, 3, 101, 17, 6), &.{ 1, 2, 3, 4, 5, 6 }, .{ .paragraph = 2, .character = 7, .style = 3, .border_fill = 9 }, 6);
    errdefer table.deinit(a);
    _ = try table.replaceText(a, 1, 2, "셀😀\n끝", 100);
    return table;
}

test "HWP5 new table records preserve common signed fields and all cell ownership" {
    const a = std.testing.allocator;
    var table = try create(a);
    defer table.deinit(a);
    const bytes = try records.write(a, &table, .{ .raw = 0x05000302 }, options, resources, 1, limits);
    defer a.free(bytes);
    var iterator = @import("../record.zig").Iterator.init(bytes, .{});
    const control = (try iterator.next()).?;
    try std.testing.expectEqual(@as(u10, 71), control.tag);
    const header = try @import("../body/control_header.zig").Header.parse(control.payload);
    try std.testing.expectEqual(@import("../body/control_rules.zig").table_id, header.id);
    const common = try @import("../body/object_common.zig").Properties.parse(header.properties);
    try std.testing.expectEqual(@as(i32, -835), common.offset_y);
    try std.testing.expectEqual(@as(i32, -2), common.z_order);
    try std.testing.expectEqual(@as(u32, 101), common.width);
    try std.testing.expectEqual(@as(u32, 34), common.height);
    try std.testing.expectEqual(@as(u32, 33), common.instance_id);
    const description = std.unicode.utf8ToUtf16LeStringLiteral("새 표😀");
    try std.testing.expectEqualSlices(u8, std.mem.sliceAsBytes(description[0..description.len]), common.description_utf16.?);
    try std.testing.expectEqual(@as(u10, 77), (try iterator.next()).?.tag);
    var cell_count: usize = 0;
    while (try iterator.next()) |record| {
        if (record.tag == 72) cell_count += 1;
        try std.testing.expect(record.level == 2 or record.level == 3);
    }
    try std.testing.expectEqual(@as(usize, 6), cell_count);
    // A synthetic host establishes real control/list/paragraph parent relations.
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    var host: [24]u8 = @splat(0);
    std.mem.writeInt(u32, host[0..4], 0x80000009, .little);
    std.mem.writeInt(u32, host[4..8], 1 << 11, .little);
    std.mem.writeInt(u16, host[12..14], 1, .little);
    std.mem.writeInt(u32, host[18..22], 77, .little);
    try @import("../record_writer.zig").append(a, &out, 66, 0, &host, 4096);
    var anchor: [18]u8 = @splat(0);
    std.mem.writeInt(u16, anchor[0..2], 11, .little);
    std.mem.writeInt(u32, anchor[2..6], @import("../body/control_rules.zig").table_id, .little);
    std.mem.writeInt(u16, anchor[14..16], 11, .little);
    std.mem.writeInt(u16, anchor[16..18], 13, .little);
    try @import("../record_writer.zig").append(a, &out, 67, 1, &anchor, 4096);
    try @import("../record_writer.zig").append(a, &out, 68, 1, &.{ 0, 0, 0, 0, 0, 0, 0, 0 }, 4096);
    try out.appendSlice(a, bytes);
    var tree = try @import("../body/tree.zig").Tree.parse(a, out.items, .{ .raw = 0x05000302 }, .{});
    defer tree.deinit(a);
    const inspected = try @import("../body/table_validation.zig").inspect(a, tree, .{ .list_layout = .observed8, .zone_layout = .spec_column_first, .border_count = 10 });
    try std.testing.expectEqual(@as(usize, 1), inspected.tables);
    try std.testing.expectEqual(@as(usize, 6), inspected.cells);
    try std.testing.expectEqual(@as(usize, 7), (try @import("../body/paragraphs.zig").inspect(tree, resources.paragraphs)).paragraphs);
    var links = try @import("../body/control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), links.items.len);
    try std.testing.expectEqual(@as(usize, 0), links.items[0].start_unit);
    try std.testing.expectEqual(@as(usize, 0), links.observedCount());
    var groups = try @import("../body/list_groups.zig").Groups.build(a, tree);
    defer groups.deinit(a);
    try std.testing.expectEqual(@as(usize, 6), groups.items.len);
    for (groups.items) |group| try std.testing.expectEqual(@as(usize, 1), group.paragraph_count);
    var flows = try @import("../body/paragraph_flows.zig").Flows.build(a, tree, groups.items);
    defer flows.deinit(a);
}

test "HWP5 new table records reject local ID collisions resource gaps sizing policy and budgets" {
    const a = std.testing.allocator;
    var table = try create(a);
    defer table.deinit(a);
    var invalid = options;
    invalid.common.flags = 1;
    try std.testing.expectError(error.InvalidTableCreationPolicy, records.write(a, &table, .{ .raw = 0x05000302 }, invalid, resources, 1, limits));
    var absent = resources;
    absent.border_count = 8;
    try std.testing.expectError(error.InvalidBorderFillReference, records.write(a, &table, .{ .raw = 0x05000302 }, options, absent, 1, limits));
    table.cells[5].paragraph_id = 1;
    try std.testing.expectError(error.InvalidTableParagraphIds, records.write(a, &table, .{ .raw = 0x05000302 }, options, resources, 1, limits));
    table.cells[5].paragraph_id = 6;
    try std.testing.expectError(error.LimitExceeded, records.write(a, &table, .{ .raw = 0x05000302 }, options, resources, 1022, limits));
    try std.testing.expectError(error.InvalidTableOwner, records.write(a, &table, .{ .raw = 0x05000302 }, options, resources, 0, limits));
    try std.testing.expectError(error.LimitExceeded, records.write(a, &table, .{ .raw = 0x05000302 }, options, resources, 1, .{ .max_cells = 5, .max_bytes = 4096 }));
    try std.testing.expectError(error.LimitExceeded, records.write(a, &table, .{ .raw = 0x05000302 }, options, resources, 1, .{ .max_cells = 6, .max_bytes = 100 }));
}

test "HWP5 new table records check every output budget and the exact maximum control depth" {
    const a = std.testing.allocator;
    var table = try create(a);
    defer table.deinit(a);
    var before = try table.clone(a);
    defer before.deinit(a);
    const baseline = try records.write(a, &table, .{ .raw = 0x05000302 }, options, resources, 1021, limits);
    defer a.free(baseline);
    var exact = limits;
    exact.max_bytes = baseline.len;
    const output = try records.write(a, &table, .{ .raw = 0x05000302 }, options, resources, 1021, exact);
    defer a.free(output);
    try std.testing.expectEqualSlices(u8, baseline, output);
    for (0..baseline.len) |limit| {
        var bounded = limits;
        bounded.max_bytes = limit;
        try std.testing.expectError(error.LimitExceeded, records.write(a, &table, .{ .raw = 0x05000302 }, options, resources, 1021, bounded));
    }
    var iterator = @import("../record.zig").Iterator.init(output, .{});
    var deepest: u10 = 0;
    while (try iterator.next()) |record| deepest = @max(deepest, record.level);
    try std.testing.expectEqual(@as(u10, 1023), deepest);
    try std.testing.expectEqualDeep(before, table);
}

test "HWP5 new table records release all allocation failures without changing the model" {
    const a = std.testing.allocator;
    var table = try create(a);
    defer table.deinit(a);
    var before = try table.clone(a);
    defer before.deinit(a);
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const model.Table) !void {
            const bytes = try records.write(allocator, source, .{ .raw = 0x05000302 }, options, resources, 1, limits);
            defer allocator.free(bytes);
        }
    }.run, .{&table});
    try std.testing.expectEqualDeep(before, table);
}
