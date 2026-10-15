//! Validate structural formula edits against the complete saved topology.
const std = @import("std");
const editor = @import("editor_session.zig");

pub fn splice(session: *editor.Session, section_index: usize, paragraph: usize, start: u32, deleted: u32, inserted: []const u8, limit: usize, anchored: bool) !bool {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    const current = if (section.structure_values) |*values| values else return error.MissingStructuralValues;
    const a = session.allocator;
    var draft = try current.clone(a);
    defer draft.deinit(a);
    const changed = try @import("paragraph_structure_splice.zig").spliceMode(a, &section.tree, &draft, paragraph, start, deleted, inserted, limit, anchored);
    if (!changed) return false;
    var before_sites = try @import("paragraph_structure_projection.zig").collect(a, &section.tree, current, editor.siteOptions(session.options));
    defer before_sites.deinit(a);
    var after_sites = try @import("paragraph_structure_projection.zig").collect(a, &section.tree, &draft, editor.siteOptions(session.options));
    defer after_sites.deinit(a);
    const trees = try a.alloc(@import("xml_part_tree.zig").Tree, session.sections.len);
    defer a.free(trees);
    for (session.sections, trees) |value, *tree| tree.* = value.tree;
    try @import("formula_numeric_input_guard.zig").validateFormulaTransition(a, trees, section_index, &before_sites, &after_sites, &section.formula_definitions);
    const sections = try a.dupe(editor.Section, session.sections);
    defer a.free(sections);
    sections[section_index].structure_values = draft;
    var proxy = session.*;
    proxy.sections = sections;
    const verified = try proxy.save();
    defer a.free(verified);
    // Ownership exchange is the only operation after validation succeeds.
    std.mem.swap(@import("paragraph_structure_values.zig").Values, current, &draft);
    return true;
}
