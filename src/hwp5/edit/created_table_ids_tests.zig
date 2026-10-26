const std = @import("std");
const ids = @import("created_table_ids.zig");
const model = @import("../../model/document.zig");
const Values = @import("created_table_values.zig").Values;
const version: @import("../version.zig").Version = .{ .raw = 0x05000302 };

fn exercise(a: std.mem.Allocator, raw: []const u8, document: *const model.Document, pending: []const Values, expected: [3]u32) !void {
    var first = try ids.plan(a, &.{raw}, version, document, pending, 2, 100);
    defer first.deinit(a);
    var second = try ids.plan(a, &.{raw}, version, document, pending, 2, 100);
    defer second.deinit(a);
    try std.testing.expectEqualDeep(first, second);
    try std.testing.expectEqualSlices(u32, expected[0..2], first.paragraph_ids);
    try std.testing.expectEqual(expected[2], first.instance_id);
    var table = try @import("../../model/created_table.zig").create(a, first.identity, first.instance_id, try @import("../../model/table_creation_plan.zig").create(1, 2, 100, 20, 2), first.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 2);
    defer table.deinit(a);
    try ids.validate(a, &.{raw}, version, document, pending, &table, 100);
}

test "HWP5 created table IDs reserve original current common form and optional picture candidates" {
    const a = std.testing.allocator;
    var raw: std.ArrayList(u8) = .empty;
    defer raw.deinit(a);
    var header: [24]u8 = @splat(0);
    std.mem.writeInt(u32, header[18..22], 7, .little);
    try @import("../record_writer.zig").append(a, &raw, 66, 0, &header, 4096);
    var common: [44]u8 = @splat(0);
    std.mem.writeInt(u32, common[0..4], @import("../body/control_rules.zig").form_id, .little);
    std.mem.writeInt(u32, common[36..40], 9, .little);
    try @import("../record_writer.zig").append(a, &raw, 71, 1, &common, 4096);
    var picture: [78]u8 = @splat(0);
    std.mem.writeInt(u32, picture[74..78], 11, .little);
    try @import("../record_writer.zig").append(a, &raw, 85, 2, &picture, 4096);
    var paragraphs = [_]model.Paragraph{.{ .source_node = 0, .parent_node = null, .instance_id = 13, .declared_units = 1, .text_present = false, .para_shape_id = 0, .style_id = 0, .tokens = &.{}, .character_runs = &.{}, .deferred_direct_records = 0 }};
    var sections = [_]model.Section{.{ .paragraphs = &paragraphs, .source_record_count = 3 }};
    const document: model.Document = .{ .format = .hwp5, .sections = &sections };
    var pending = [_]Values{.{}};
    defer pending[0].deinit(a);
    const before = try a.dupe(u8, raw.items);
    defer a.free(before);
    try exercise(a, raw.items, &document, &pending, .{ 1, 2, 3 });
    try @import("../../testing/allocation_failures.zig").check(exercise, .{ @as([]const u8, raw.items), &document, @as([]const Values, &pending), [3]u32{ 1, 2, 3 } });
    try std.testing.expectEqualSlices(u8, before, raw.items);
    var plan = try ids.plan(a, &.{raw.items}, version, &document, &pending, 2, 100);
    defer plan.deinit(a);
    var table = try @import("../../model/created_table.zig").create(a, plan.identity, plan.instance_id, try @import("../../model/table_creation_plan.zig").create(1, 2, 100, 20, 2), plan.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 2);
    defer table.deinit(a);
    for ([_]u32{ 9, 11 }) |instance| {
        table.instance_id = instance;
        try std.testing.expectError(error.InvalidCreatedTableIdentity, ids.validate(a, &.{raw.items}, version, &document, &pending, &table, 100));
    }
    table.instance_id = plan.instance_id;
    for ([_]u32{ 0, 7, 13 }) |paragraph| {
        table.cells[0].paragraph_id = paragraph;
        try std.testing.expectError(error.InvalidTableParagraphIds, ids.validate(a, &.{raw.items}, version, &document, &pending, &table, 100));
    }
    table.cells[0].paragraph_id = table.cells[1].paragraph_id;
    try std.testing.expectError(error.InvalidTableParagraphIds, ids.validate(a, &.{raw.items}, version, &document, &pending, &table, 100));
    try std.testing.expectError(error.SourceBindingMismatch, ids.plan(a, &.{}, version, &document, &pending, 1, 100));
    try std.testing.expectError(error.UnsupportedVersion, ids.plan(a, &.{raw.items}, .{ .raw = 0x04000000 }, &document, &pending, 1, 100));
    try std.testing.expectError(error.LimitExceeded, ids.plan(a, &.{raw.items}, version, &document, &pending, 2, 1));
    try std.testing.expectError(error.InvalidCreatedTableCells, ids.plan(a, &.{raw.items}, version, &document, &pending, 0, 100));
    table.cells[0].paragraph_id = plan.paragraph_ids[0];
    var value = try @import("created_table_value.zig").Value.initClone(a, &table, .{
        .common = .{ .flags = 0x6a2211, .offset_x = 0, .offset_y = 0, .z_order = 0, .margins = .{ 0, 0, 0, 0 }, .prevent_page_break = false, .description = "표" },
        .table = .{ .page_break = 1, .repeat_header = false, .cell_spacing = 0, .margins = .{ 0, 0, 0, 0 } },
        .cell = .{ .layout = .observed8, .unknown = 0, .attributes = 0, .margins = .{ 0, 0, 0, 0 } },
    }, 4096);
    defer value.deinit(a);
    try pending[0].append(a, .{ .host = .{ .original_node = 0 }, .unit = 0 }, &value, 1, 4096);
    try std.testing.expectError(error.InvalidCreatedTableIdentity, ids.validate(a, &.{raw.items}, version, &document, &pending, &table, 100));
    try exercise(a, raw.items, &document, &pending, .{ 4, 5, 6 });
    try @import("../../testing/allocation_failures.zig").check(exercise, .{ @as([]const u8, raw.items), &document, @as([]const Values, &pending), [3]u32{ 4, 5, 6 } });
    common[0] = 0xff;
    var unknown: std.ArrayList(u8) = .empty;
    defer unknown.deinit(a);
    try @import("../record_writer.zig").append(a, &unknown, 71, 0, &common, 4096);
    try std.testing.expectError(error.UnsupportedCreatedTableIdSource, ids.plan(a, &.{unknown.items}, version, &document, &pending, 1, 100));
}
