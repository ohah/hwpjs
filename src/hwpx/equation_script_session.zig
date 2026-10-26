//! Atomic script transactions over immutable source + owned current values.
const std = @import("std");
const editor = @import("editor_session.zig");
const Values = @import("equation_script_values.zig").Values;
pub fn options(session: *const editor.Session) @import("equation_script_write.zig").Options {
    return .{
        .max_script_bytes = @min((@import("equation.zig").Options{}).max_script_bytes, session.options.max_text_bytes),
        .max_output_bytes = session.options.max_xml_bytes,
        .selection = editor.siteOptions(session.options).branch_policy,
    };
}
pub fn read(session: *const editor.Session, section: usize, node: usize) ![]u8 {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const part = &session.sections[section];
    return part.equation_scripts.read(session.allocator, &part.tree, node, options(session));
}
pub fn set(session: *editor.Session, section: usize, node: usize, text: []const u8) !bool {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const a = session.allocator;
    const part = &session.sections[section];
    var values = try part.equation_scripts.clone(a);
    defer values.deinit(a);
    if (!try values.set(a, &part.tree, node, text, options(session), session.options.max_text_bytes)) return false;
    const sections = try a.dupe(editor.Section, session.sections);
    defer a.free(sections);
    sections[section].equation_scripts = values;
    var candidate = session.*;
    candidate.sections = sections;
    const saved = try candidate.save();
    defer a.free(saved);
    std.mem.swap(Values, &part.equation_scripts, &values);
    return true;
}

/// Compose existing body/dutmal dirty values with equation invalidation.
pub fn fieldDirty(session: *const editor.Session, section: usize) ![]@import("text_sites_save.zig").FieldDirty {
    const a = session.allocator;
    const initial = try @import("dutmal_field_dirty.zig").read(session, section);
    var output: std.ArrayList(@import("text_sites_save.zig").FieldDirty) = .{ .items = initial, .capacity = initial.len, .pointer_stability = .{} };
    defer output.deinit(a);
    const part = &session.sections[section];
    if (part.equation_scripts.entries.items.len != 0) {
        var analysis = try @import("source_field_analysis.zig").leaseForExterior(session);
        defer analysis.deinit(a);
        for (part.equation_scripts.entries.items) |entry| {
            const leaf = try @import("equation_script_write.zig").target(a, &part.tree, entry.equation, options(session));
            try @import("field_leaf_invalidation.zig").note(a, &part.tree, section, &analysis.source, leaf, error.UnsupportedEquationFieldEdit, &output);
        }
    }
    return output.toOwnedSlice(a);
}
