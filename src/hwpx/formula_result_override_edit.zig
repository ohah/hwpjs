//! Candidate manual-result transaction. Never publishes an unverified save.
const std = @import("std");
const editor = @import("editor_session.zig");
const Values = @import("formula_result_override_values.zig").Values;

pub fn set(session: *editor.Session, section_index: usize, begin: usize, display: []const u8) !bool {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    const a = session.allocator;
    var candidate = try section.formula_result_overrides.clone(a);
    defer candidate.deinit(a);
    if (!try candidate.set(a, &section.tree, begin, display)) return false;
    const sections = try a.dupe(editor.Section, session.sections);
    defer a.free(sections);
    sections[section_index].formula_result_overrides = candidate;
    var proxy = session.*;
    proxy.sections = sections;
    const verified = try proxy.save();
    defer a.free(verified);
    if (@import("created_table_host_splice.zig").hasPending(&proxy)) try @import("created_table_saved_formulas.zig").validate(&proxy, verified);
    std.mem.swap(Values, &candidate, &section.formula_result_overrides);
    return true;
}
