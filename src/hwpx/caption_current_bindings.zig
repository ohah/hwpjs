//! Current/joined paragraph traversal; owner semantics remain in the resolver.
const std = @import("std");
const editor = @import("editor_session.zig");
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;

pub fn fromParagraphs(comptime Binding: type, comptime resolve: anytype, a: std.mem.Allocator, section: *const editor.Section, paragraphs: []const Paragraph) ![]Binding {
    if (paragraphs.len > 100000) return error.LimitExceeded;
    var output: std.ArrayList(Binding) = .empty;
    defer output.deinit(a);
    for (paragraphs, 0..) |paragraph, index| {
        const owner = try resolve(&section.tree, paragraph.template_element);
        if (paragraph.joined()) |joined| {
            try joined.validate();
            for (joined.pieces) |piece| {
                if (!std.meta.eql(owner, try resolve(&section.tree, piece.template_element))) return error.SourceBindingMismatch;
            }
        }
        if (owner) |value| try output.append(a, .{ .paragraph = std.math.add(usize, section.first_paragraph, index) catch return error.LimitExceeded, .owner = value });
    }
    return output.toOwnedSlice(a);
}

pub fn read(comptime Binding: type, comptime resolve: anytype, a: std.mem.Allocator, session: *const editor.Session, section_index: usize) ![]Binding {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    return fromParagraphs(Binding, resolve, a, section, current.paragraphs);
}
