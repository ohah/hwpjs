//! 원본 계산 필드의 현재 좌표를 변환하고 공통 분할 후보를 준비합니다.
const std = @import("std");
const editor = @import("editor_session.zig");
const model = @import("paragraph_structure_values.zig");
const Tree = @import("xml_part_tree.zig").Tree;

pub fn prepare(session: *const editor.Session, trees: []const Tree, section: usize, current: *const model.Values, index: usize, paragraph: usize, start: u32, end: u32, id: u32) !?model.Values {
    const row = &current.paragraphs[index];
    if (session.sections[section].structure_values != null) {
        var installed_report = try @import("field_markers.zig").inspect(session.allocator, trees, .{});
        defer installed_report.deinit();
        var materialized: ?model.Values = null;
        defer if (materialized) |*values| values.deinit(session.allocator);
        if (row.field_positions == null and row.character_styles != null and row.pieces == null) {
            var owned_formula = false;
            for (installed_report.markers) |marker| {
                if (marker.section_ordinal != section or marker.kind != .begin) continue;
                if (try @import("paragraph_site_owner.zig").ancestor(&trees[section], marker.element_index) == row.template_element and @import("formula_marker_kind.zig").isBegin(marker)) owned_formula = true;
            }
            if (owned_formula) {
                materialized = try current.clone(session.allocator);
                const installed = &materialized.?.paragraphs[index];
                installed.field_positions = try @import("field_source_positions.zig").build(session.allocator, trees, section, installed, &installed_report, session.options.max_sites);
            }
        }
        const prepared = if (materialized) |*values| values else current;
        const range = (try @import("formula_installed_split_plan.zig").prepare(session, trees, section, prepared, index, &installed_report, start, end)) orelse return null;
        return try @import("field_current_split.zig").prepareWholeFormula(session.allocator, trees, section, prepared, index, range.start, range.end, id, &installed_report, session.options.max_xml_bytes, session.options.max_sites);
    }
    if (!try @import("field_split_session_candidate.zig").hasSourceField(&trees[section], row.template_element)) return null;
    var report = try @import("field_markers.zig").inspect(session.allocator, trees, .{});
    defer report.deinit();
    var has_formula = false;
    for (report.markers) |marker| {
        if (marker.section_ordinal != section or marker.kind != .begin) continue;
        if (try @import("paragraph_site_owner.zig").ancestor(&trees[section], marker.element_index) != row.template_element) continue;
        if (@import("formula_marker_kind.zig").isBegin(marker)) has_formula = true;
    }
    if (!has_formula) return null;
    const plan = (try @import("field_source_outside_plan.zig").prepareFormulaSplit(session, section, paragraph, start, end)) orelse return error.SourceBindingMismatch;
    defer plan.deinit(session.allocator);
    return try @import("field_structure_split.zig").prepareWholeFormula(session.allocator, trees, section, current, index, plan.start, plan.end, id, &report, session.options.max_xml_bytes, session.options.max_sites);
}
