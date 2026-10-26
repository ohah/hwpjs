//! Read-only command ownership: selection is based on setter permission, not width.
const Target = @import("field_label_targets.zig").Target;
pub fn select(session: anytype, section: usize, paragraph: usize, start: u32, end: u32) !?Target {
    if (end < start) return error.InvalidTextPosition;
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const selected_section = &session.sections[section];
    if (paragraph < selected_section.first_paragraph or paragraph > selected_section.last_paragraph) return error.InvalidParagraphIndex;
    const a = session.allocator;
    if (selected_section.structure_values == null) {
        var source = try @import("source_field_analysis.zig").leaseForExterior(session);
        defer source.deinit(a);
        var in_section = false;
        for (source.source.fields) |field| if (field.section == section) {
            in_section = true;
        };
        if (!in_section) return null;
        const segments = @import("source_field_paragraph_positions.zig").build(session, section, paragraph) catch |err| switch (err) {
            error.UnsupportedFieldLabelContent, error.UnsupportedInlineControl, error.MissingTextSite, error.UnsupportedTextPositionProjection => return null,
            else => return err,
        };
        defer a.free(segments);
        var intersects = false;
        for (source.source.fields) |field| if (@import("field_text_positions.zig").project(field, section, segments) != null) {
            intersects = true;
        };
        if (!intersects) return null;
    }
    const targets = try session.fieldLabels(section, paragraph);
    defer a.free(targets);
    var selected: ?Target = null;
    for (targets) |target| {
        if (start < target.start or end > target.end) continue;
        if (selected_section.structure_values) |*current| {
            const row = &current.paragraphs[paragraph - selected_section.first_paragraph];
            if (row.field_positions != null) {
                var source = try @import("source_field_analysis.zig").leaseForLabels(session, section);
                defer source.deinit(a);
                const field = find_field: {
                    for (source.source.fields) |field| if (field.section == section and source.source.report.markers[field.begin_marker].element_index == target.begin_element) break :find_field field;
                    return error.InvalidFieldElement;
                };
                const segments = @import("field_label_splice.zig").validateOwnedRange(a, &selected_section.tree, row, field, section, .{ .start_unit = target.start, .end_unit = target.end }, start, end) catch |err| switch (err) {
                    error.ProtectedInlineControl, error.MissingFieldTextSite => continue,
                    else => return err,
                };
                a.free(segments);
                if (selected != null) return error.UnsupportedFieldLabelRange;
                selected = target;
                continue;
            }
        }
        const prepared = try @import("field_label_session.zig").prepare(session, section, paragraph, target.begin_element);
        defer prepared.deinit(a);
        _ = @import("field_label_session.zig").validatePreparedRange(prepared, section, start, end) catch |err| switch (err) {
            error.ProtectedFieldRange, error.ProtectedInlineControl, error.MissingFieldTextSite => continue,
            else => return err,
        };
        if (selected != null) return error.UnsupportedFieldLabelRange;
        selected = target;
    }
    return selected;
}
