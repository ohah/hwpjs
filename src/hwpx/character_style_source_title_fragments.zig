//! 검증된 source-owned title run의 다중 서식 출력만 소유합니다.
//! 권한/필드 연결/좌표 변환은 호출자가 소유합니다. 이동된 title은 받지 않습니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Span = @import("character_style_paint.zig").Span;
const writer = @import("xml_source_writer.zig");

const Output = struct {
    a: std.mem.Allocator,
    tree: *const Tree,
    base: usize,
    limit: usize,
    bytes: std.ArrayList(u8) = .empty,
    cursor: @import("source_change_cursor.zig").Cursor,

    pub fn append(self: *@This(), bytes: []const u8) !void {
        if (bytes.len > self.limit -| self.bytes.items.len) return error.LimitExceeded;
        try self.bytes.appendSlice(self.a, bytes);
    }

    // 원본 구간은 순서대로 한 번만 소비합니다. 필드 dirty/삭제도 같은 cursor를 씁니다.
    pub fn gap(self: *@This(), high: usize) !void {
        if (high < self.base) return error.InvalidSourceSpan;
        const low = self.cursor.position;
        const selected = try self.cursor.take(low, high - self.base);
        var local: std.ArrayList(writer.Change) = .empty;
        defer local.deinit(self.a);
        for (selected) |change| {
            var moved = change;
            moved.start -= low;
            moved.end -= low;
            try local.append(self.a, moved);
        }
        const bytes = try writer.write(self.a, self.tree.source[self.base + low .. high], local.items, self.limit -| self.bytes.items.len);
        defer self.a.free(bytes);
        try self.append(bytes);
    }

    fn skipText(self: *@This(), low: usize, high: usize) !void {
        if (low < self.base or high < low) return error.InvalidSourceSpan;
        if ((try self.cursor.take(low - self.base, high - self.base)).len != 0) return error.InvalidSourceSpan;
    }
};

/// character_style_source_title_run에서 전체 binding/coverage 검증을 마친 입력만 받습니다.
/// text_site_edit/공유 XML writer가 UTF16 경계와 escaping을 계속 소유합니다.
pub fn writeValidated(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, spans: []const Span, fields: []const @import("text_sites_save.zig").FieldDirty, limit: usize) ![]u8 {
    if (spans.len == 0 or paragraph.title_positions != null) return error.SourceBindingMismatch;
    const run_index = spans[0].run_element;
    if (run_index >= tree.elements.len) return error.SourceBindingMismatch;
    const run = tree.elements[run_index];
    const ending = run.end_tag orelse return error.SourceBindingMismatch;
    const base = run.start_tag.start;
    var changes: std.ArrayList(writer.Change) = .empty;
    defer changes.deinit(a);
    var tags: std.ArrayList([]u8) = .empty;
    defer {
        for (tags.items) |tag| a.free(tag);
        tags.deinit(a);
    }
    if (paragraph.field_positions) |owned| {
        try @import("field_style_control_changes.zig").append(a, tree, run_index, &.{.{ .start = run.start_tag.end, .end = ending.start }}, owned, fields, paragraph.generated_id != null, &changes, &tags, limit);
    }
    std.mem.sort(writer.Change, changes.items, {}, struct {
        fn less(_: void, left: writer.Change, right: writer.Change) bool {
            return left.start < right.start;
        }
    }.less);
    var output: Output = .{ .a = a, .tree = tree, .base = base, .limit = limit, .cursor = try @import("source_change_cursor.zig").Cursor.init(changes.items, run.start_tag.end - base, ending.start - base) };
    defer output.bytes.deinit(a);
    for (spans, 0..) |span, i| {
        const consumed_source_low = output.base + output.cursor.position;
        if (span.site_index >= paragraph.sites.items.len or span.run_element != run_index) return error.InvalidTextSites;
        const site = paragraph.sites.items[span.site_index];
        if (site.element_index >= tree.elements.len or site.missing_text or site.anchor_boundary) return error.InvalidTextSites;
        const text = tree.elements[site.element_index];
        const starts_site = i == 0 or spans[i - 1].site_index != span.site_index;
        const ends_site = i + 1 == spans.len or spans[i + 1].site_index != span.site_index;
        const starts_text = starts_site and (i == 0 or paragraph.sites.items[spans[i - 1].site_index].element_index != site.element_index);
        const ends_text = ends_site and (i + 1 == spans.len or paragraph.sites.items[spans[i + 1].site_index].element_index != site.element_index);
        if (span.start_unit < span.site_start_unit or span.end_unit < span.start_unit) return error.InvalidTextSites;
        const low = try @import("text_site_edit.zig").bytePosition(site.text, std.math.cast(u32, span.start_unit - span.site_start_unit) orelse return error.LimitExceeded);
        const high = try @import("text_site_edit.zig").bytePosition(site.text, std.math.cast(u32, span.end_unit - span.site_start_unit) orelse return error.LimitExceeded);
        if (span.char_shape_id) |id| {
            const opening = try @import("character_style_tag.zig").write(a, tree, run_index, id, limit -| output.bytes.items.len);
            defer a.free(opening);
            try output.append(opening);
        } else try output.append(tree.source[run.start_tag.start..run.start_tag.end]);
        if (starts_text) try output.gap(text.start_tag.start);
        if (site.empty_element) {
            // 기존 빈 t의 소유 style은 span에 보존됩니다. materialize는 공유 writer만 수행합니다.
            if (ends_site) try output.skipText(site.start, site.end);
            if (site.text.len == 0) {
                if (!starts_site or !ends_site) return error.InvalidTextSites;
                try output.append(tree.sourceOf(site.element_index));
            } else {
                const body = try writer.write(a, tree.sourceOf(site.element_index), &.{.{ .start = 0, .end = site.end - site.start, .text = site.text[low..high], .expand_empty_element = true }}, limit -| output.bytes.items.len);
                defer a.free(body);
                try output.append(body);
            }
        } else {
            const text_end = text.end_tag orelse return error.SourceBindingMismatch;
            if (starts_text) try output.gap(text.start_tag.end) else try output.append(tree.source[text.start_tag.start..text.start_tag.end]);
            if (starts_text) try output.gap(site.start);
            // 원본 결과를 재계산하지 않고 검증된 현재 site 범위를 escaped CharData로 출력합니다.
            const body = try writer.write(a, "", &.{.{ .start = 0, .end = 0, .text = site.text[low..high] }}, limit -| output.bytes.items.len);
            defer a.free(body);
            try output.append(body);
            if (ends_site) {
                try output.skipText(site.start, site.end);
                const gap_end = if (ends_text) text_end.start else paragraph.sites.items[spans[i + 1].site_index].start;
                try @import("title_fragment_owner.zig").gap(a, tree, paragraph.title_fragment_owners, site.element_index, run_index, span.char_shape_id, gap_end, &output);
            }
            if (ends_text) try output.gap(text.end) else try output.append(tree.source[text_end.start..text.end]);
        }
        // 원본 t 사이의 ctrl/metadata는 직전 fragment가 한 번만 보존합니다.
        if (ends_text) {
            const next_text = if (i + 1 == spans.len) ending.start else tree.elements[paragraph.sites.items[spans[i + 1].site_index].element_index].start_tag.start;
            try output.gap(next_text);
        }
        try output.append(tree.source[ending.start..run.end]);
        try @import("title_derived_gap.zig").emit(a, tree, paragraph, run_index, consumed_source_low, output.base + output.cursor.position, &output);
    }
    try output.cursor.finish();
    return output.bytes.toOwnedSlice(a);
}
