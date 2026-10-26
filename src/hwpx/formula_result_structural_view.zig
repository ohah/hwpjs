//! Request-local serialized topology; original field IDs remain command identities.
const std = @import("std");
const editor = @import("editor_session.zig");
pub const View = struct {
    original: *const @import("xml_part_tree.zig").Tree,
    rendered: editor.Session,
    section: usize,

    pub fn deinit(self: *View) void {
        self.rendered.deinit();
        self.* = undefined;
    }
    pub fn originalNode(self: *const View, node: usize) !usize {
        return @import("formula_definition_rebind.zig").findNode(self.rendered.allocator, &self.rendered.sections[self.section].tree, self.original, node);
    }
};

pub fn open(session: *const editor.Session, section: usize) !View {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const sections = try session.allocator.dupe(editor.Section, session.sections);
    defer session.allocator.free(sections);
    for (sections) |*part| part.created_tables = .{};
    var base = session.*;
    base.sections = sections;
    const bytes = try base.save();
    defer session.allocator.free(bytes);
    var rendered = try editor.open(session.allocator, bytes, session.options);
    errdefer rendered.deinit();
    if (rendered.sections.len != session.sections.len or rendered.sections[section].first_paragraph != session.sections[section].first_paragraph or rendered.sections[section].last_paragraph != session.sections[section].last_paragraph) return error.SourceBindingMismatch;
    return .{ .original = &session.sections[section].tree, .rendered = rendered, .section = section };
}
