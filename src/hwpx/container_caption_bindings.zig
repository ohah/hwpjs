//! Container caption identity uses the shared current/joined paragraph traversal.
const std = @import("std");
const editor = @import("editor_session.zig");
const Tree = @import("xml_part_tree.zig").Tree;
pub const Owner = struct { container_node: usize, caption_node: usize, list_node: usize };
pub const Binding = struct { paragraph: usize, owner: Owner };

pub fn resolve(tree: *const Tree, template: usize) !?Owner {
    const owner = (try @import("caption_list_owner.zig").resolve(tree, template, .container)) orelse return null;
    return .{ .container_node = owner.component_node, .caption_node = owner.caption_node, .list_node = owner.list_node };
}

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section: usize) ![]Binding {
    return @import("caption_current_bindings.zig").read(Binding, resolve, a, session, section);
}
