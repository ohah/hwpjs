//! Validate retained metadata against original-source markers in current text.
const std = @import("std");
pub fn build(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, report: *const @import("field_markers.zig").Report, limit: usize) ![]@import("field_position.zig").Position {
    if (paragraph.source_ordinal == null or paragraph.generated_id != null or paragraph.pieces != null) return error.UnsupportedStructuralFieldEdit;
    var text = paragraph.*;
    text.field_positions = null;
    const positions = try @import("field_source_positions.zig").build(a, trees, section, &text, report, limit);
    errdefer a.free(positions);
    if (paragraph.field_positions) |retained| {
        if (retained.len != positions.len) return error.InvalidFieldPositions;
        for (retained, positions) |one, two| if (!std.meta.eql(one, two)) return error.InvalidFieldPositions;
    }
    return positions;
}
