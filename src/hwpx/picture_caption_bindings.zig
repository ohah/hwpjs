//! Picture caption paragraphs derived from current source ownership.
const std = @import("std");
const editor = @import("editor_session.zig");
const Tree = @import("xml_part_tree.zig").Tree;
pub const Owner = struct { picture_node: usize, caption_node: usize, list_node: usize };
pub const Binding = struct { paragraph: usize, owner: Owner };

pub fn resolve(tree: *const Tree, template: usize) !?Owner {
    const owner = (try @import("caption_list_owner.zig").resolve(tree, template, .picture)) orelse return null;
    return .{ .picture_node = owner.component_node, .caption_node = owner.caption_node, .list_node = owner.list_node };
}

pub fn fromParagraphs(a: std.mem.Allocator, section: *const editor.Section, paragraphs: []const @import("paragraph_structure_values.zig").Paragraph) ![]Binding {
    return @import("caption_current_bindings.zig").fromParagraphs(Binding, resolve, a, section, paragraphs);
}

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize) ![]Binding {
    return @import("caption_current_bindings.zig").read(Binding, resolve, a, session, section_index);
}
