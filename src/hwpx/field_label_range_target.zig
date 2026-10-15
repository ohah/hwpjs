//! Select one current label using the existing mutation permission checks.
const std = @import("std");
const Target = @import("field_label_targets.zig").Target;

pub fn select(session: anytype, section_index: usize, paragraph: usize, start: u32, end: u32) !?Target {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const part = &session.sections[section_index];
    if (paragraph < part.first_paragraph or paragraph > part.last_paragraph) return error.InvalidParagraphIndex;
    if (end < start) return error.InvalidTextPosition;
    const a = session.allocator;
    const labels = try session.fieldLabels(section_index, paragraph);
    defer a.free(labels);
    var result: ?Target = null;
    for (labels) |label| {
        if (start < label.start or end > label.end) continue;
        validate(session, section_index, paragraph, label, start, end) catch |err| switch (err) {
            error.ProtectedInlineControl, error.MissingFieldTextSite, error.UnsupportedStructuralFieldEdit, error.UnsupportedInlineControl => continue,
            else => return err,
        };
        if (result != null) return error.UnsupportedFieldLabelRange;
        result = label;
    }
    return result;
}

fn validate(session: anytype, section_index: usize, paragraph: usize, label: Target, start: u32, end: u32) !void {
    const a = session.allocator;
    const part = &session.sections[section_index];
    if (part.structure_values) |*values| {
        const row = &values.paragraphs[paragraph - part.first_paragraph];
        if (row.field_positions != null) {
            var analysis = try @import("source_field_analysis.zig").lease(session);
            defer analysis.deinit(a);
            const field = found: {
                for (analysis.source.fields) |range| {
                    if (range.section == section_index and analysis.source.report.markers[range.begin_marker].element_index == label.begin_element) break :found range;
                }
                return error.InvalidFieldElement;
            };
            const checked = try @import("field_label_splice.zig").validateOwnedRange(a, &part.tree, row, field, section_index, .{ .start_unit = label.start, .end_unit = label.end }, start, end - start);
            defer checked.deinit(a);
            return;
        }
    }
    const prepared = try @import("field_label_session.zig").prepare(session, section_index, paragraph, label.begin_element);
    defer prepared.deinit(a);
    _ = try @import("field_label_session.zig").validatePreparedRange(prepared, section_index, start, end);
}
