//! Fresh projection of immutable header and current resource intents.
const std = @import("std");
const Row = @import("../model/character_strike_snapshot.zig").Row;
pub fn read(session: *const @import("editor_session.zig").Session) ![]Row {
    const a = session.allocator;
    var document = try @import("package.zig").inspectDocument(a, session.source, .{});
    defer document.deinit(a);
    var resources = try document.inspectHeaderResources(a, .{});
    defer resources.deinit(a);
    var tree = try document.readHeaderTree(a, .{});
    defer tree.deinit(a);
    const ids = resources.table(.char_shape).ids.items;
    const rows = try a.alloc(Row, ids.len + session.character_resources.entries.items.len);
    errdefer a.free(rows);
    for (ids, 0..) |id, index| rows[index] = try row(session, &tree, id);
    for (session.character_resources.entries.items, 0..) |entry, index| rows[ids.len + index] = try row(session, &tree, entry.id);
    std.mem.sort(Row, rows, {}, struct {
        fn less(_: void, left: Row, right: Row) bool {
            return left.id < right.id;
        }
    }.less);
    for (rows, 0..) |value, index| if (index > 0 and rows[index - 1].id == value.id) return error.DuplicateCharacterResourceId;
    return rows;
}
fn row(session: *const @import("editor_session.zig").Session, tree: *const @import("xml_part_tree.zig").Tree, id: u32) !Row {
    const enabled = @import("character_strike_current.zig").read(session, tree, id) catch |err| switch (err) {
        error.UnsupportedCharacterStrikeShape => return .{ .id = id, .enabled = null },
        else => return err,
    };
    return .{ .id = id, .enabled = enabled };
}
