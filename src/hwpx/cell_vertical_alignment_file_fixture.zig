//! Own blank document -> created table -> saved original physical table.
const std = @import("std");
pub fn make(a: std.mem.Allocator) ![]u8 {
    const blank = try @import("../new_document/hwpx.zig").create(a);
    defer a.free(blank);
    var session = try @import("editor_session.zig").open(a, blank, .{});
    defer session.deinit();
    var ids = try @import("created_table_source_ids.zig").plan(&session, 4);
    defer ids.deinit(a);
    var table = try @import("../model/created_table.zig").create(a, ids.identity, ids.instance_id, try @import("../model/table_creation_plan.zig").create(2, 2, 20000, 4000, 4), ids.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 4);
    defer table.deinit(a);
    for ([_][]const u8{ "A", "B", "C", "D" }, 0..) |text, i| _ = try table.replaceText(a, @intCast(i / 2), @intCast(i % 2), text, 100);
    if (!try @import("created_table_session.zig").stage(&session, 0, session.sections[0].first_paragraph, 0, &table)) return error.OwnFixtureTableNotCreated;
    return session.save();
}
