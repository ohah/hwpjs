//! 현재 사각형 소유 문단과 보호 앵커입니다. 텍스트 유무와 독립적입니다.
const std = @import("std");
const editor = @import("editor_session.zig");
pub const Host = struct { paragraph: usize, anchor_unit: usize, anchor_node: usize };

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize, node: usize) !Host {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    const tree = &section.tree;
    if (node >= tree.elements.len or !tree.elements[node].is(@import("document_xml.zig").paragraph_uri, "rect")) return error.UnsupportedDrawingTextAnchor;
    const group = try @import("grouped_shape_context.zig").read(tree, node);
    if (@import("run_anchor.zig").kind(tree, node) != .rectangle and group == null) return error.UnsupportedDrawingTextAnchor;
    const anchor = if (group) |context| context.root_anchor else node;
    const template = tree.elements[tree.elements[anchor].parent.?].parent.?;
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    const ordinal = block: {
        for (current.paragraphs) |paragraph| {
            if (paragraph.protected_positions != null and try @import("paragraph_display_host.zig").matchesTemplate(&paragraph, template))
                break :block try @import("protected_display_host.zig").currentOrdinal(current.paragraphs, section.first_paragraph, template, anchor);
        }
        break :block try @import("paragraph_display_host.zig").currentOrdinal(current.paragraphs, section.first_paragraph, template);
    };
    return .{ .paragraph = ordinal, .anchor_node = anchor, .anchor_unit = try @import("protected_display_host.zig").anchorPosition(a, tree, &current.paragraphs[ordinal - section.first_paragraph], anchor) };
}
