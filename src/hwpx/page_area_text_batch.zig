//! Page-owner text plus retained page metadata on one detached paragraph draft.
//! Existing source/partition validators remain authoritative. Column groups,
//! fields, joined pieces and title/style output each require their own profile
//! adapter before the whole-document writer may publish their combined result.
const std = @import("std");
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Tree = @import("xml_part_tree.zig").Tree;
const Edit = @import("../model/independent_text_edits.zig").Edit;
pub fn positions(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph) ![]@import("paragraph_text_positions.zig").Segment {
    if (paragraph.page_area_positions == null) return error.MissingPageAreaPositions;
    // These are separate owner profiles, not conditions to hide by detaching
    // metadata in a temporary Session. The caller must prepare those profiles.
    if (paragraph.column_boundaries != null) return error.DocumentTextColumnGroupRequired;
    if ((if (paragraph.title_positions) |rows| rows.len != 0 else false) or
        (if (paragraph.title_fragment_owners) |rows| rows.len != 0 else false) or
        paragraph.title_output_projection != null) return error.DocumentTextTitleProfileRequired;
    try @import("page_area_current_validate.zig").validatePartitionMember(a, tree, paragraph);
    return @import("paragraph_protected_positions.zig").build(a, tree, paragraph);
}
pub fn prepare(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, edits: []const Edit, max_bytes: usize) !?Paragraph {
    const segments = try positions(a, tree, paragraph);
    defer a.free(segments);
    for (edits) |edit| if (edit.expected == null) return error.MissingExpectedText;
    var draft = try paragraph.clone(a);
    errdefer draft.deinit(a);
    const units = std.math.cast(u32, if (segments.len == 0) 0 else segments[segments.len - 1].end_unit) orelse return error.LimitExceeded;
    var text = try @import("text_splice_transaction.zig").prepareManyProjected(a, &draft.sites, segments, edits, .{
        .max_bytes = max_bytes,
        .replacement_inheritance = .first_replaced,
    });
    defer text.deinit();
    if (!text.changed) {
        draft.deinit(a);
        return null;
    }
    var mapping = try @import("zero_width_coordinate_batch.zig").prepare(a, units, text.edits);
    defer mapping.deinit(a);
    const areas = try @import("zero_width_coordinate_batch.zig").pageAreas(a, mapping, draft.page_area_positions.?);
    var installed = false;
    defer if (!installed) a.free(areas);
    _ = try text.commit(&draft.sites);
    a.free(draft.page_area_positions.?);
    draft.page_area_positions = areas;
    installed = true;
    try @import("page_area_current_validate.zig").validatePartitionMember(a, tree, &draft);
    return draft;
}
