//! Own deterministic HWP5 factory and existing table author, reopened as original cells.
const std = @import("std");
pub fn make(a: std.mem.Allocator) ![]u8 {
    return makeWithAttributes(a, 0);
}
pub fn makeWithAttributes(a: std.mem.Allocator, attributes: u32) ![]u8 {
    const blank = try @import("../../new_document/hwp5.zig").create(a);
    defer a.free(blank);
    const session = try @import("style_preservation.zig").Session.open(a, blank);
    defer session.close();
    var ids = try session.planTableIdsWithAllocator(a, 4);
    defer ids.deinit(a);
    var table = try @import("../../model/created_table.zig").create(a, ids.identity, ids.instance_id, try @import("../../model/table_creation_plan.zig").create(2, 2, 20000, 4000, 4), ids.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 0 }, 4);
    defer table.deinit(a);
    for ([_][]const u8{ "A", "B", "C", "D" }, 0..) |text, i| _ = try table.replaceText(a, @intCast(i / 2), @intCast(i % 2), text, 100);
    var history = try @import("editor_history.zig").History.initV2(a, session, .{});
    defer history.deinit();
    var options = @import("../../new_document/hwp5_profile_test_options.zig").creationOptions();
    options.table.margins = .{ 144, 288, 432, 576 };
    options.cell.margins = .{ 10, 20, 30, 40 };
    options.cell.attributes = attributes;
    if (!try history.apply(session, .{ .stage_table = .{ .section = 0, .paragraph = 0, .unit = 16, .table = &table, .options = options } })) return error.OwnFixtureTableNotCreated;
    return (try session.save(a, .{ .allow_stale_layout = true })).bytes;
}
