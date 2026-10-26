//! Range-specific source field permission, never whole-field edit permission.
pub fn allowed(session: *const @import("editor_session.zig").Session, section: usize, paragraph: usize, unit: u32) !bool {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    if (!try @import("source_field_analysis.zig").hasFields(session, section)) return false;
    if (session.sections[section].structure_values != null) {
        if (try @import("formula_partition_table_exterior.zig").allowed(session, section, paragraph, unit)) |permitted| return permitted;
        if (try @import("structural_formula_exterior.zig").prepare(session, section, paragraph, unit, unit)) |plan| {
            defer plan.deinit(session.allocator);
            return true;
        }
        return @import("field_outside_query.zig").canEdit(session, section, paragraph, unit, unit);
    }
    const plan = (try @import("field_source_outside_plan.zig").prepare(session, section, paragraph, unit, unit)) orelse return false;
    defer plan.deinit(session.allocator);
    return true;
}
