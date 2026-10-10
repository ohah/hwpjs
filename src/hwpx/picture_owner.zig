const std = @import("std");
const editor = @import("editor_session.zig");
const host = @import("picture_display_host.zig");

pub const Owner = struct { paragraph: usize, anchor_node: usize, anchor_unit: usize };

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize, picture: usize) !Owner {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    const ordinal = try host.currentOrdinal(&section.tree, current.paragraphs, section.first_paragraph, picture);
    const anchor = try host.owningAnchor(a, &section.tree, &current.paragraphs[ordinal - section.first_paragraph], picture);
    return .{ .paragraph = ordinal, .anchor_node = anchor.source_node, .anchor_unit = anchor.unit };
}
