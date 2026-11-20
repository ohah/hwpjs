//! Detached title/text/style preparation. Canonical output projections need
//! their own fragment adapter; their existing guard is never removed here.
const std = @import("std");
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Tree = @import("xml_part_tree.zig").Tree;
const Segment = @import("paragraph_text_positions.zig").Segment;
const Edit = @import("../model/independent_text_edits.zig").Edit;
pub const Resources = std.AutoHashMapUnmanaged(u32, void);
pub const Options = struct { max_bytes: usize, max_spans: usize };

pub fn positions(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph) ![]Segment {
    if (paragraph.title_positions == null) return error.MissingTitlePositions;
    if (paragraph.title_output_projection != null or paragraph.title_fragment_owners != null) return error.DocumentTextTitleProjectionRequired;
    if (paragraph.field_positions != null) return error.DocumentTextFieldTitleProfileRequired;
    if (paragraph.page_area_positions != null or paragraph.column_boundaries != null) return error.DocumentTextTitleGroupRequired;
    if (paragraph.pieces != null) return error.DocumentTextJoinedTitleProfileRequired;
    const locations = try @import("paragraph_structure_locations.zig").build(a, tree, paragraph);
    defer a.free(locations);
    try @import("plain_paragraph_policy.zig").validateWithTabs(tree, &paragraph.sites, locations, 1, true);
    const segments = try @import("paragraph_protected_positions.zig").build(a, tree, paragraph);
    errdefer a.free(segments);
    const valid = try @import("paragraph_scalar_boundaries.zig").build(a, &paragraph.sites, segments, @import("../model/text_transaction.zig").limits.text_units);
    defer a.free(valid);
    var seen: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer seen.deinit(a);
    for (paragraph.title_positions.?) |title| {
        if (!@import("title_mark_axis.zig").retained(tree, title.element_index) or
            (try seen.getOrPut(a, title.element_index)).found_existing) return error.SourceBindingMismatch;
        const text = tree.elements[title.element_index].parent.?;
        const run = tree.elements[text].parent.?;
        if (tree.elements[run].parent != paragraph.template_element) return error.SourceBindingMismatch;
        try @import("paragraph_scalar_boundaries.zig").validate(valid, title.unit);
    }
    return segments;
}

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, edits: []const Edit, options: Options, resources: ?*const Resources) !?Paragraph {
    const segments = try positions(a, tree, paragraph);
    defer a.free(segments);
    for (edits) |edit| if (edit.expected == null) return error.MissingExpectedText;
    if (paragraph.character_styles) |styles| {
        const allowed = resources orelse return error.MissingCharacterResources;
        for (styles) |span| if (!allowed.contains(span.char_shape_id orelse return error.MissingCharacterShapeReference))
            return error.InvalidCharacterShapeReference;
    }
    var draft = try paragraph.clone(a);
    errdefer draft.deinit(a);
    var text = try @import("text_splice_transaction.zig").prepareManyProjected(a, &draft.sites, segments, edits, .{
        .max_bytes = options.max_bytes,
        .replacement_inheritance = .first_replaced,
    });
    defer text.deinit();
    if (!text.changed) {
        draft.deinit(a);
        return null;
    }
    const units = std.math.cast(u32, if (segments.len == 0) 0 else segments[segments.len - 1].end_unit) orelse return error.LimitExceeded;
    var mapping = try @import("zero_width_coordinate_batch.zig").prepare(a, units, text.edits);
    defer mapping.deinit(a);
    const titles = try @import("zero_width_coordinate_batch.zig").titles(a, mapping, draft.title_positions.?);
    var installed = false;
    defer if (!installed) a.free(titles);
    const protected = if (draft.protected_positions) |rows|
        try @import("zero_width_coordinate_batch.zig").protectedPositions(a, mapping, rows)
    else
        null;
    defer if (!installed) if (protected) |rows| a.free(rows);
    if (draft.character_styles) |styles| {
        var metadata = try @import("character_style_splice.zig").prepareManyProjected(a, &draft, &text, styles, options.max_spans);
        defer metadata.deinit();
        _ = try metadata.commit(&draft, &text);
    } else _ = try text.commit(&draft.sites);
    a.free(draft.title_positions.?);
    draft.title_positions = titles;
    if (protected) |rows| {
        a.free(draft.protected_positions.?);
        draft.protected_positions = rows;
    }
    installed = true;
    const checked = try positions(a, tree, &draft);
    a.free(checked);
    return draft;
}
