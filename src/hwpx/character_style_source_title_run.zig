//! 원본 소유 title run을 검증하고 단일/다중 서식 serializer로 분기합니다.
//! Does not grant edit/format permission or infer ownership of moved titles.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Span = @import("character_style_paint.zig").Span;
const writer = @import("xml_source_writer.zig");
const uri = @import("document_xml.zig").paragraph_uri;

pub fn tryWrite(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, spans: []const Span, fields: []const @import("text_sites_save.zig").FieldDirty, limit: usize) !?[]u8 {
    return tryWriteOptions(a, tree, paragraph, spans, fields, .{}, limit);
}

/// 실제 session의 canonical site options를 전달합니다. 기본값을 추정하지 않습니다.
pub fn tryWriteOptions(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, spans: []const Span, fields: []const @import("text_sites_save.zig").FieldDirty, options: @import("text_sites.zig").Options, limit: usize) !?[]u8 {
    const emitted = (try prepareOptions(a, tree, paragraph, spans, fields, options, limit)) orelse return null;
    return emitted.bytes;
}

/// 같은 검증된 writer의 실제 분기를 반환합니다. 별도 추정 규칙을 만들지 않습니다.
pub const Emission = struct { bytes: []u8, per_span: bool };
pub fn prepareOptions(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, spans: []const Span, fields: []const @import("text_sites_save.zig").FieldDirty, options: @import("text_sites.zig").Options, limit: usize) !?Emission {
    // Existing writers retain responsibility for moved/partitioned title owners.
    if (spans.len == 0 or paragraph.title_positions != null) return null;
    const first = spans[0];
    if (first.run_element >= tree.elements.len) return error.SourceBindingMismatch;
    const run = tree.elements[first.run_element];
    if (!run.is(uri, "run") or run.parent != paragraph.template_element) return error.SourceBindingMismatch;
    var has_title = false;
    var child = run.first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        const node = tree.elements[index];
        if (node.is(uri, "t")) {
            var nested = node.first_child;
            while (nested) |marker| : (nested = tree.elements[marker].next_sibling) {
                if (!@import("title_mark_axis.zig").retained(tree, marker)) return null;
                has_title = true;
            }
        }
    }
    if (!has_title) return null;
    // 탭/앵커 및 이동된 title 소유권은 기존 경로의 책임입니다.
    for (spans) |span| if (span.tab_element != null or span.anchor_element != null) return null;
    if (!@import("element_whitespace_gaps.zig").empty(tree, first.run_element)) return error.UnsupportedInlineControl;
    child = run.first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        const node = tree.elements[index];
        if (node.is(uri, "t")) {
            const raw = tree.sourceOf(index);
            if (std.mem.indexOf(u8, raw, "<!--") != null or std.mem.indexOf(u8, raw, "<?") != null) return error.UnsupportedInlineControl;
        } else if (!@import("retained_field_marker.zig").supported(tree, index) and !@import("retained_run_metadata.zig").supported(tree, index) and !(paragraph.field_positions != null and node.is(uri, "secPr"))) return null;
    }
    // Preserve the fragment writer's dirty-input validation before serialization.
    for (fields, 0..) |field, index| {
        for (fields[0..index]) |previous| if (previous.element_index == field.element_index) return error.DuplicateFieldDirty;
        if (field.element_index >= tree.elements.len) return error.InvalidElementIndex;
        if (!tree.elements[field.element_index].is(uri, "fieldBegin")) return error.InvalidFieldElement;
    }
    // Reconstruct the immutable binding inventory. Never trust arbitrary offsets.
    var original = try @import("text_sites.zig").collect(a, tree, options);
    defer original.deinit(a);
    const Text = struct { element: usize, style: ?u32 };
    var texts: std.ArrayList(Text) = .empty;
    defer texts.deinit(a);
    var changes: std.ArrayList(writer.Change) = .empty;
    defer changes.deinit(a);
    var tags: std.ArrayList([]u8) = .empty;
    defer {
        for (tags.items) |tag| a.free(tag);
        tags.deinit(a);
    }
    var multi_style = false;
    var next: usize = 0;
    var cursor = first.start_unit;
    const base = run.start_tag.start;
    for (original.items) |before| {
        if (before.element_index >= tree.elements.len) return error.InvalidTextSites;
        if (tree.elements[before.element_index].parent != first.run_element) continue;
        if (next >= spans.len) return error.SourceBindingMismatch;
        const start_index = next;
        const site_index = spans[next].site_index;
        if (site_index >= paragraph.sites.items.len or spans[next].site_start_unit != cursor) return error.InvalidTextSites;
        const after = paragraph.sites.items[site_index];
        // siteChange is the shared complete source-binding check, also for no-op.
        const change = try @import("text_sites_save.zig").siteChange(tree, before, after);
        const style = spans[next].char_shape_id;
        if (texts.items.len == 0 or texts.items[texts.items.len - 1].element != before.element_index) {
            try texts.append(a, .{ .element = before.element_index, .style = style });
        } else if (texts.items[texts.items.len - 1].style != style) multi_style = true;
        while (next < spans.len and spans[next].site_index == site_index) : (next += 1) {
            const span = spans[next];
            if (span.char_shape_id != style) multi_style = true;
            if (span.run_element != first.run_element or span.start_unit != cursor or span.end_unit < cursor or span.site_start_unit != spans[start_index].site_start_unit) return error.InvalidTextSites;
            if (next > start_index and span.start_unit == span.end_unit and span.canonical_fragment == null) return error.InvalidTextSites;
            if (next > start_index and span.canonical_fragment != null and span.canonical_fragment != spans[start_index].canonical_fragment) multi_style = true;
            cursor = span.end_unit;
        }
        const units = try @import("text_site_edit.zig").utf16Length(after.text);
        if (cursor - spans[start_index].site_start_unit != units) return error.InvalidTextSites;
        if (change) |value| {
            var local = value;
            local.start -= base;
            local.end -= base;
            try changes.append(a, local);
        }
    }
    if (next != spans.len) return error.SourceBindingMismatch;
    try @import("title_fragment_identity.zig").validate(paragraph, spans);
    // Every current site in this run must be covered once, in source order.
    var owned_count: usize = 0;
    for (paragraph.sites.items) |site| {
        if (site.element_index >= tree.elements.len) return error.InvalidTextSites;
        if (tree.elements[site.element_index].parent == first.run_element) owned_count += 1;
    }
    var span_sites: usize = 0;
    for (spans, 0..) |span, index| if (index == 0 or spans[index - 1].site_index != span.site_index) {
        span_sites += 1;
    };
    if (span_sites != owned_count) return error.SourceBindingMismatch;
    // Verify that source text children are present once and in source order.
    var text_index: usize = 0;
    child = run.first_child;
    while (child) |element| : (child = tree.elements[element].next_sibling) {
        if (!tree.elements[element].is(uri, "t")) continue;
        if (text_index >= texts.items.len or texts.items[text_index].element != element) return null;
        text_index += 1;
    }
    if (text_index != texts.items.len or text_index == 0) return error.SourceBindingMismatch;
    if (paragraph.title_fragment_owners) |owners| for (owners) |owner| {
        if (owner.text_element >= tree.elements.len) return error.SourceBindingMismatch;
        if (tree.elements[owner.text_element].parent != first.run_element) continue;
        for (texts.items) |text| if (text.element == owner.text_element and text.style != owner.char_shape_id) {
            multi_style = true;
        };
    };
    // 모든 immutable binding/현재 span/빈 owner 검증 뒤에만 새 직렬화를 선택합니다.
    if (try @import("title_derived_gap.zig").requiresFragments(tree, paragraph, first.run_element)) multi_style = true;
    if (multi_style) return .{ .bytes = try @import("character_style_source_title_fragments.zig").writeValidated(a, tree, paragraph, spans, fields, limit), .per_span = true };
    const ending = run.end_tag orelse return error.SourceBindingMismatch;
    // Collect control/dirty/continuation changes once for the complete run.
    // Text changes above and control changes share one source-offset inventory.
    if (paragraph.field_positions) |owned| {
        try @import("field_style_control_changes.zig").append(a, tree, first.run_element, &.{.{ .start = run.start_tag.end, .end = ending.start }}, owned, fields, paragraph.generated_id != null, &changes, &tags, limit);
    }
    std.mem.sort(writer.Change, changes.items, {}, struct {
        fn less(_: void, left: writer.Change, right: writer.Change) bool {
            if (left.start == right.start) return left.end < right.end;
            return left.start < right.start;
        }
    }.less);
    var source_changes = try @import("source_change_cursor.zig").Cursor.init(changes.items, run.start_tag.end - base, ending.start - base);
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    var group: usize = 0;
    while (group < texts.items.len) {
        var after_group = group + 1;
        while (after_group < texts.items.len and texts.items[after_group].style == texts.items[group].style) : (after_group += 1) {}
        // A control before a differently styled next t stays in this group.
        // Disjoint source intervals ensure every child is emitted exactly once.
        const low = if (group == 0) run.start_tag.end else tree.elements[texts.items[group].element].start_tag.start;
        const high = if (after_group == texts.items.len) ending.start else tree.elements[texts.items[after_group].element].start_tag.start;
        const remaining = limit -| output.items.len;
        const opening = if (texts.items[group].style) |id| try @import("character_style_tag.zig").write(a, tree, first.run_element, id, remaining) else try a.dupe(u8, tree.source[run.start_tag.start..run.start_tag.end]);
        defer a.free(opening);
        var chunk: std.ArrayList(writer.Change) = .empty;
        defer chunk.deinit(a);
        try chunk.append(a, .{ .start = 0, .end = run.start_tag.end - base, .text = "", .start_tag = opening });
        if (low > run.start_tag.end) try chunk.append(a, .{ .start = run.start_tag.end - base, .end = low - base, .text = "" });
        // A crossing edit is an error, never silently omitted by a filter.
        try chunk.appendSlice(a, try source_changes.take(low - base, high - base));
        if (high < ending.start) try chunk.append(a, .{ .start = high - base, .end = ending.start - base, .text = "" });
        // Header, prefix removal, consumed edits and suffix removal are sorted.
        // The XML writer independently checks duplicate/overlapping spans.
        const bytes = try writer.write(a, tree.sourceOf(first.run_element), chunk.items, remaining);
        defer a.free(bytes);
        if (bytes.len > remaining) return error.LimitExceeded;
        try output.appendSlice(a, bytes);
        group = after_group;
    }
    try source_changes.finish();
    return .{ .bytes = try output.toOwnedSlice(a), .per_span = false };
}
