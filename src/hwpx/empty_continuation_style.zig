//! 끝 분할의 빈 continuation 입력 서식. Sites/source binding은 그대로 둡니다.
const std = @import("std");
const P = @import("paragraph_structure_values.zig").Paragraph;
const paint = @import("character_style_paint.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const Segment = @import("paragraph_text_positions.zig").Segment;

/// 기존 plain split 이후 private candidate에만 적용합니다. commit은 Session 소유.
pub fn apply(a: std.mem.Allocator, tree: *const Tree, before: *const P, right: *P, at: u32, end: u32, resource_ids: []const u32, max_spans: usize) !void {
    if (!eligible(before, right, at, end) or resource_ids.len == 0) return;
    for (before.sites.items) |site| {
        if (site.element_index >= tree.elements.len) return error.SourceBindingMismatch;
        var child = tree.elements[site.element_index].first_child;
        var visited: usize = 0;
        while (child) |node| : (child = tree.elements[node].next_sibling) {
            if (node >= tree.elements.len or visited >= tree.elements.len or tree.elements[node].parent != site.element_index) return error.SourceBindingMismatch;
            visited += 1;
            if (tree.elements[node].is(@import("document_xml.zig").paragraph_uri, "titleMark")) return;
        }
    }
    if (before.template_element != right.template_element) return error.SourceBindingMismatch;
    if (before.sites.items.len != right.sites.items.len) return error.SourceBindingMismatch;
    for (before.sites.items, right.sites.items) |old, next| _ = try @import("text_sites_save.zig").siteChange(tree, old, next);
    const original_positions = positions(a, tree, before) catch |err| switch (err) {
        // 기존 구조 지원 범위는 유지하며 이 서식 intent만 적용하지 않습니다.
        error.UnsupportedParagraphControl, error.UnsupportedInlineControl => return,
        else => return err,
    };
    defer a.free(original_positions);
    if (original_positions.len == 0 or original_positions[original_positions.len - 1].end_unit != at) return;
    const original = try spans(a, tree, before, original_positions, resource_ids, max_spans);
    defer a.free(original);
    // 양의 폭을 가진 가시 구간의 왼쪽 affinity. 빈 원본은 기존 첫 site 유지.
    var id: ?u32 = null;
    for (original) |span| {
        if ((at == 0 and span.start_unit == 0) or (span.start_unit < at and at <= span.end_unit)) {
            id = span.char_shape_id;
            break;
        }
    }
    const selected = id orelse return;
    if (std.mem.indexOfScalar(u32, resource_ids, selected) == null) return error.InvalidResourceReference;
    const right_positions = try positions(a, tree, right);
    defer a.free(right_positions);
    const target = @import("text_splice_transaction.zig").insertionSite(&right.sites, right_positions, 0) orelse return error.InvalidTextSites;
    const current = try spans(a, tree, right, right_positions, resource_ids, max_spans);
    errdefer a.free(current);
    var selected_index: ?usize = null;
    for (current, 0..) |span, index| {
        if (span.start_unit != 0 or span.end_unit != 0) return error.InvalidTextSites;
        if (selected_index == null and span.site_index == target) selected_index = index;
    }
    const carrier = selected_index orelse return error.SourceBindingMismatch;
    if (current[carrier].char_shape_id == selected) {
        a.free(current);
        return;
    }
    current[carrier].char_shape_id = selected;
    // 이후 fallible 작업 없음. 기존 서식 소유권도 성공 직전에만 교체.
    if (right.character_styles) |old| a.free(old);
    right.character_styles = current;
}
pub fn eligible(before: *const P, right: *const P, at: u32, end: u32) bool {
    if (at != end or right.generated_id == null or before.pieces != null or right.pieces != null or before.field_positions != null or right.field_positions != null or before.protected_positions != null or right.protected_positions != null or before.column_boundaries != null or right.column_boundaries != null or before.page_area_positions != null or right.page_area_positions != null) return false;
    // HEAD has no output plan field; newer models retain their existing guard.
    if (comptime @hasField(P, "title_output_projection")) {
        if (before.title_output_projection != null or right.title_output_projection != null) return false;
    }
    if (before.title_positions) |titles| if (titles.len != 0) return false;
    if (right.title_positions) |titles| if (titles.len != 0) return false;
    for (right.sites.items) |site| if (site.text.len != 0) return false;
    if (right.sites.items.len == 0) return false;
    return true;
}
fn positions(a: std.mem.Allocator, tree: *const Tree, paragraph: *const P) ![]Segment {
    const locations = try @import("paragraph_structure_locations.zig").build(a, tree, paragraph);
    defer a.free(locations);
    try @import("plain_paragraph_policy.zig").validateWithTabs(tree, &paragraph.sites, locations, 1, false);
    return @import("paragraph_text_positions.zig").build(a, tree, &paragraph.sites, locations, 1);
}
fn spans(a: std.mem.Allocator, tree: *const Tree, paragraph: *const P, axis: []const Segment, resource_ids: []const u32, limit: usize) ![]paint.Span {
    const projected = try @import("character_style_projection.zig").build(a, tree, &paragraph.sites, axis, limit);
    defer a.free(projected);
    if (paragraph.character_styles) |owned| {
        // shared validator checks UTF16/current partition; numeric paint is a no-op.
        if (owned.len == 0 or owned.len > limit) return error.InvalidTextSites;
        if (projected.len == 0) return error.InvalidTextSites;
        var projection_index: usize = 0;
        for (owned, 0..) |span, index| {
            if (index != 0 and owned[index - 1].site_index != span.site_index) {
                if (owned[index - 1].end_unit != projected[projection_index].end_unit) return error.InvalidTextSites;
                projection_index += 1;
            }
            if (projection_index >= projected.len) return error.SourceBindingMismatch;
            const source = projected[projection_index];
            if (span.site_index != source.site_index or span.run_element != source.run_element or span.site_start_unit != source.start_unit or span.tab_element != null or span.anchor_element != null) return error.SourceBindingMismatch;
            if (span.start_unit < source.start_unit or span.end_unit > source.end_unit) return error.InvalidTextSites;
            if (span.char_shape_id) |id| if (std.mem.indexOfScalar(u32, resource_ids, id) == null) return error.InvalidResourceReference;
        }
        if (projection_index + 1 != projected.len or owned[owned.len - 1].end_unit != projected[projection_index].end_unit) return error.InvalidTextSites;
        // prepare validates every span and every site's complete text consumption.
        const first_id = owned[0].char_shape_id orelse resource_ids[0];
        return paint.prepare(a, &paragraph.sites, owned, 0, 0, first_id, resource_ids, limit);
    }
    return paint.fromProjection(a, projected, limit);
}
