//! Request-local rectangle inventory with one current paragraph view.
const std = @import("std");
const editor = @import("editor_session.zig");
const hosts = @import("rectangle_display_host.zig");
const rendering = @import("rectangle_rendering_source.zig");
pub const Row = struct { rectangle_node: usize, source: rendering.Source, owner: hosts.Host };

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize) ![]Row {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const tree = &session.sections[section_index].tree;
    var nodes: std.ArrayList(usize) = .empty;
    defer nodes.deinit(a);
    for (tree.elements, 0..) |element, node| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "rect")) {
            if (nodes.items.len >= 100000) return error.LimitExceeded;
            try nodes.append(a, node);
        }
    }
    const owners = try hosts.readMany(a, session, section_index, nodes.items);
    defer a.free(owners);
    const rows = try a.alloc(Row, nodes.items.len);
    errdefer a.free(rows);
    for (nodes.items, owners, rows) |node, owner, *row| row.* = .{ .rectangle_node = node, .source = try rendering.read(a, tree, node), .owner = owner };
    return rows;
}
