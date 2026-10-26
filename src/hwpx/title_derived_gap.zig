//! Canonical collector-created trailing gaps, distinct from original text Sites.
//! Numeric provenance only; never a new text owner or editing permission.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
pub const Gap = struct {
    marker_element: usize,
    text_element: usize,
    run_element: usize,
    char_shape_id: ?u32,
    materialized: bool,
    // Nonmaterialized gap's unique current text carrier; null = standalone marker.
    carrier_fragment: ?usize = null,
};
pub fn digest(items: []const Gap) u64 {
    var hash = std.hash.Wyhash.init(0);
    for (items) |item| {
        for ([_]usize{ item.marker_element, item.text_element, item.run_element }) |value| hash.update(std.mem.asBytes(&value));
        const has_id: u8 = @intFromBool(item.char_shape_id != null);
        hash.update(std.mem.asBytes(&has_id));
        if (item.char_shape_id) |value| hash.update(std.mem.asBytes(&value));
        const has_carrier: u8 = @intFromBool(item.carrier_fragment != null);
        hash.update(std.mem.asBytes(&has_carrier));
        if (item.carrier_fragment) |value| hash.update(std.mem.asBytes(&value));
        const explicit: u8 = @intFromBool(item.materialized);
        hash.update(std.mem.asBytes(&explicit));
    }
    return hash.final();
}
fn inventory(paragraph: *const Paragraph) ![]const Gap {
    const plan = paragraph.title_output_projection orelse return &.{};
    if ((plan.derived_gaps.len != 0 or plan.derived_gap_digest != 0) and digest(plan.derived_gaps) != plan.derived_gap_digest) return error.SourceBindingMismatch;
    if (plan.template_element != paragraph.template_element) return error.SourceBindingMismatch;
    return plan.derived_gaps;
}
fn sourceValid(tree: *const Tree, paragraph: *const Paragraph, gap: Gap) !void {
    if (gap.marker_element >= tree.elements.len or gap.text_element >= tree.elements.len or gap.run_element >= tree.elements.len) return error.SourceBindingMismatch;
    if (!@import("title_mark_axis.zig").retained(tree, gap.marker_element) or tree.elements[gap.marker_element].parent != gap.text_element or tree.elements[gap.text_element].parent != gap.run_element or tree.elements[gap.run_element].parent != paragraph.template_element) return error.SourceBindingMismatch;
}
fn markerStyle(paragraph: *const Paragraph, marker: usize) !?u32 {
    var found = false;
    var style: ?u32 = null;
    for (paragraph.title_fragment_owners orelse return error.SourceBindingMismatch) |owner| {
        if (owner.element_index != marker) continue;
        if (found) return error.SourceBindingMismatch;
        found = true;
        style = owner.char_shape_id;
    }
    if (!found) return error.SourceBindingMismatch;
    return style;
}
// The selected source span consumes the raw interval containing this marker.
// If owner.gap detaches a differently styled standalone marker fragment, there
// is no text carrier to partition: null is a proved standalone fragment.
fn carrierSpan(tree: *const Tree, paragraph: *const Paragraph, marker_index: usize) !?@import("character_style_paint.zig").Span {
    const marker = tree.elements[marker_index];
    const text = marker.parent orelse return error.SourceBindingMismatch;
    const run = tree.elements[text].parent orelse return error.SourceBindingMismatch;
    const owner_style = try markerStyle(paragraph, marker_index);
    for (paragraph.title_fragment_owners.?) |owner| {
        if (owner.element_index == marker_index and (owner.text_element != text or owner.end_unit < owner.start_unit)) return error.SourceBindingMismatch;
    }
    const spans = paragraph.character_styles orelse return error.SourceBindingMismatch;
    _ = try @import("title_fragment_identity.zig").validateRun(spans);
    var selected: ?@import("character_style_paint.zig").Span = null;
    for (spans) |span| {
        if (span.tab_element != null or span.anchor_element != null or span.site_index >= paragraph.sites.items.len) return error.SourceBindingMismatch;
        const site = paragraph.sites.items[span.site_index];
        if (site.element_index != text) continue;
        if (span.run_element != run or site.start > site.end or site.start < tree.elements[text].start_tag.end or site.end > (tree.elements[text].end_tag orelse return error.SourceBindingMismatch).start) return error.SourceBindingMismatch;
        if (site.end > marker.start_tag.start) continue;
        if (span.canonical_fragment == null) return error.SourceBindingMismatch;
        selected = span;
    }
    const carrier = selected orelse return error.SourceBindingMismatch;
    if (carrier.char_shape_id != owner_style) return null;
    const site = paragraph.sites.items[carrier.site_index];
    // Earlier markers in this same raw gap can also detach the marker from text.
    for (paragraph.title_fragment_owners.?) |other| {
        if (other.text_element != text or other.element_index == marker_index) continue;
        if (other.element_index >= tree.elements.len) return error.SourceBindingMismatch;
        const prior = tree.elements[other.element_index];
        if (prior.start_tag.start >= site.end and prior.end <= marker.start_tag.start and other.char_shape_id != carrier.char_shape_id) return null;
    }
    return carrier;
}
fn partitioned(tree: *const Tree, paragraph: *const Paragraph, gap: Gap, painted: []const @import("character_style_paint.zig").Span) !bool {
    try sourceValid(tree, paragraph, gap);
    const carrier = try carrierSpan(tree, paragraph, gap.marker_element);
    if (carrier == null) {
        if (gap.carrier_fragment != null) return error.SourceBindingMismatch;
        return false;
    }
    const original = carrier.?;
    const id = original.canonical_fragment orelse return error.SourceBindingMismatch;
    if (gap.carrier_fragment != id) return error.SourceBindingMismatch;
    var count: usize = 0;
    var cursor = original.start_unit;
    for (painted) |span| {
        if (span.canonical_fragment != id) continue;
        if (span.site_index != original.site_index or span.run_element != original.run_element or span.site_start_unit != original.site_start_unit or span.tab_element != null or span.anchor_element != null or span.start_unit != cursor or span.end_unit < span.start_unit or span.end_unit > original.end_unit) return error.SourceBindingMismatch;
        if (original.start_unit != original.end_unit and span.start_unit == span.end_unit) return error.SourceBindingMismatch;
        cursor = span.end_unit;
        count = std.math.add(usize, count, 1) catch return error.LimitExceeded;
    }
    if (count == 0 or cursor != original.end_unit or (original.start_unit == original.end_unit and count != 1)) return error.SourceBindingMismatch;
    return count > 1;
}
/// Called while old styles/owners and Plan still describe the original candidate,
/// BEFORE installing painted styles and BEFORE canonical IDs are reassigned.
/// Validate all entries first; a later invalid binding cannot partly mark gaps.
pub fn prepareFormat(tree: *const Tree, paragraph: *Paragraph, painted: []const @import("character_style_paint.zig").Span) !void {
    const old = paragraph.title_output_projection orelse return;
    try old.validate(paragraph);
    for (try inventory(paragraph)) |gap| {
        try sourceValid(tree, paragraph, gap);
        _ = try markerStyle(paragraph, gap.marker_element);
        if (!gap.materialized) _ = try partitioned(tree, paragraph, gap, painted);
    }
    const plan = &paragraph.title_output_projection.?;
    for (plan.derived_gaps) |*gap| {
        if (!gap.materialized and (try partitioned(tree, paragraph, gap.*, painted))) gap.materialized = true;
    }
    plan.derived_gap_digest = digest(plan.derived_gaps);
}

/// Only actual writer-fragmented runs create inventory entries. Every retained
/// entry therefore preserves fragment mode, independent of current style/offset.
pub fn requiresFragments(tree: *const Tree, paragraph: *const Paragraph, run: usize) !bool {
    var result = false;
    for (try inventory(paragraph)) |gap| {
        try sourceValid(tree, paragraph, gap);
        _ = try markerStyle(paragraph, gap.marker_element);
        if (gap.run_element == run) result = true;
    }
    return result;
}
/// Called after closing the real fragment that consumed this original marker.
/// No source cursor is advanced and no original explicit empty t is removed.
pub fn emit(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, run: usize, low: usize, high: usize, output: anytype) !void {
    for (try inventory(paragraph)) |gap| {
        try sourceValid(tree, paragraph, gap);
        const marker = tree.elements[gap.marker_element];
        if (gap.run_element != run or marker.start_tag.start < low or marker.end > high) continue;
        if (!gap.materialized and gap.char_shape_id == (try markerStyle(paragraph, gap.marker_element))) continue;
        const original_run = tree.elements[run];
        const original_text = tree.elements[gap.text_element];
        const run_end = original_run.end_tag orelse return error.SourceBindingMismatch;
        const text_end = original_text.end_tag orelse return error.SourceBindingMismatch;
        const opening = if (gap.char_shape_id) |id|
            try @import("character_style_tag.zig").write(a, tree, run, id, output.limit -| output.bytes.items.len)
        else
            try a.dupe(u8, tree.source[original_run.start_tag.start..original_run.start_tag.end]);
        defer a.free(opening);
        try output.append(opening);
        try output.append(tree.source[original_text.start_tag.start..original_text.start_tag.end]);
        try output.append(tree.source[text_end.start..original_text.end]);
        try output.append(tree.source[run_end.start..original_run.end]);
    }
}
fn ownedMarker(tree: *const Tree, marker: usize, paragraph: usize) bool {
    if (!@import("title_mark_axis.zig").retained(tree, marker)) return false;
    const text = tree.elements[marker].parent.?;
    const run = tree.elements[text].parent.?;
    return tree.elements[run].parent == paragraph;
}
/// Capture real synthetic Sites from the same detached canonical output used by Plan.
pub fn collect(a: std.mem.Allocator, source: *const Tree, paragraph: *const Paragraph, output: *const Tree, output_owner: usize, sites: *const @import("text_sites.zig").Sites, max_gaps: usize, fragmented_runs: []const usize) ![]Gap {
    const old = try inventory(paragraph);
    const uri = @import("document_xml.zig").paragraph_uri;
    // IDs are immutable source-run IDs emitted by this request's writer trace.
    // Never infer fragmentation from styles, source endpoints or raw equality.
    for (fragmented_runs) |run| {
        if (run >= source.elements.len or !source.elements[run].is(uri, "run") or source.elements[run].parent != paragraph.template_element) return error.SourceBindingMismatch;
    }
    // Existing genuine entries require the same run to use fragment mode now.
    // Dropping the trace must fail rather than silently erase old gap history.
    for (old) |gap| {
        try sourceValid(source, paragraph, gap);
        if (std.mem.indexOfScalar(usize, fragmented_runs, gap.run_element) == null) return error.SourceBindingMismatch;
    }
    var source_markers: std.ArrayList(usize) = .empty;
    defer source_markers.deinit(a);
    var output_markers: std.ArrayList(usize) = .empty;
    defer output_markers.deinit(a);
    for (source.elements, 0..) |_, index| if (ownedMarker(source, index, paragraph.template_element)) try source_markers.append(a, index);
    for (output.elements, 0..) |_, index| if (ownedMarker(output, index, output_owner)) try output_markers.append(a, index);
    if (source_markers.items.len != output_markers.items.len) return error.SourceBindingMismatch;
    var gaps: std.ArrayList(Gap) = .empty;
    defer gaps.deinit(a);
    for (source_markers.items, output_markers.items) |original, rendered| {
        if (!std.mem.eql(u8, source.sourceOf(original), output.sourceOf(rendered))) return error.SourceBindingMismatch;
        const text = source.elements[original].parent.?;
        const run = source.elements[text].parent.?;
        const rendered_text = output.elements[rendered].parent.?;
        const rendered_run = output.elements[rendered_text].parent.?;
        const style = try @import("character_style_projection.zig").runId(a, output, rendered_run);
        if (style != (try markerStyle(paragraph, original))) return error.SourceBindingMismatch;
        var trailing = false;
        for (sites.items) |site| {
            if (site.element_index == rendered_text and site.start == site.end and site.start == output.elements[rendered].end and !site.empty_element and !site.missing_text and !site.anchor_boundary) {
                if (trailing) return error.SourceBindingMismatch;
                trailing = true;
            }
        }
        if (trailing and std.mem.indexOfScalar(usize, fragmented_runs, run) != null) {
            if (gaps.items.len >= max_gaps) return error.LimitExceeded;
            const carrier = try carrierSpan(source, paragraph, original);
            try gaps.append(a, .{ .marker_element = original, .text_element = text, .run_element = run, .char_shape_id = style, .materialized = false, .carrier_fragment = if (carrier) |span| span.canonical_fragment else null });
        }
        for (old) |prior| {
            try sourceValid(source, paragraph, prior);
            if (prior.marker_element != original) continue;
            if (!prior.materialized and prior.char_shape_id == style) continue;
            if (gaps.items.len >= max_gaps) return error.LimitExceeded;
            var retained = prior;
            retained.materialized = true;
            try gaps.append(a, retained);
        }
    }
    return gaps.toOwnedSlice(a);
}
