const std = @import("std");
const owners = @import("picture_owner.zig");
pub const Row = struct { picture_node: usize, owner: ?owners.Owner = null, failure: ?[]const u8 = null };
pub fn read(a: std.mem.Allocator, session: *const @import("editor_session.zig").Session, section: usize) ![]Row {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    var nodes: std.ArrayList(usize) = .empty;
    defer nodes.deinit(a);
    for (session.sections[section].tree.elements, 0..) |element, index| if (element.is(@import("document_xml.zig").paragraph_uri, "pic")) {
        if (nodes.items.len == owners.max_pictures) return error.LimitExceeded;
        try nodes.append(a, index);
    };
    const results = try owners.readMany(a, session, section, nodes.items);
    defer a.free(results);
    const rows = try a.alloc(Row, results.len);
    for (nodes.items, results, rows) |node, result, *row| {
        row.* = .{ .picture_node = node };
        switch (result) {
            .owner => |value| row.owner = value,
            .failure => |err| row.failure = @errorName(err),
        }
    }
    return rows;
}
