//! 서식 명령이 만든 title fragment의 style 소유권입니다. 텍스트를 소유하지 않습니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Span = @import("character_style_paint.zig").Span;
pub const Owner = struct {
    element_index: usize,
    text_element: usize,
    start_unit: usize,
    end_unit: usize,
    char_shape_id: ?u32,
};

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, spans: []const Span) !?[]Owner {
    if (paragraph.title_positions != null or paragraph.pieces != null or paragraph.generated_id != null) {
        if (paragraph.title_fragment_owners != null) return error.UnsupportedStructuralCharacterStyle;
        return null;
    }
    var output: std.ArrayList(Owner) = .empty;
    defer output.deinit(a);
    for (tree.elements, 0..) |element, index| {
        if (!@import("title_mark_axis.zig").retained(tree, index)) continue;
        const text = element.parent orelse return error.SourceBindingMismatch;
        const run = tree.elements[text].parent orelse return error.SourceBindingMismatch;
        if (tree.elements[run].parent != paragraph.template_element) continue;
        var previous: ?Owner = null;
        if (paragraph.title_fragment_owners) |owners| for (owners) |owner| {
            if (owner.element_index != index) continue;
            if (previous != null or owner.text_element != text or owner.end_unit < owner.start_unit) return error.SourceBindingMismatch;
            previous = owner;
        };
        // 삭제되어 빈 fragment가 된 owner는 이웃 글자의 서식으로 재추정하지 않습니다.
        if (previous) |owner| if (owner.start_unit == owner.end_unit) {
            try output.append(a, owner);
            continue;
        };
        var selected: ?Owner = null;
        for (spans) |span| {
            // typed owner의 sentinel은 text site가 아닙니다. 기존 adapter가 검증합니다.
            if (span.tab_element != null or span.anchor_element != null) continue;
            if (span.site_index >= paragraph.sites.items.len) return error.InvalidTextSites;
            const site = paragraph.sites.items[span.site_index];
            if (site.element_index != text or site.end > element.start_tag.start) continue;
            if (span.run_element != run or span.end_unit < span.start_unit) return error.SourceBindingMismatch;
            selected = .{ .element_index = index, .text_element = text, .start_unit = span.start_unit, .end_unit = span.end_unit, .char_shape_id = span.char_shape_id };
        }
        try output.append(a, selected orelse return error.SourceBindingMismatch);
    }
    if (output.items.len == 0) return null;
    return try output.toOwnedSlice(a);
}

/// Request-local proof. Never retained in Paragraph or output projection.
pub const Insertion = struct {
    tree: *const Tree,
    paragraph: *const @import("paragraph_structure_values.zig").Paragraph,
    span: Span,
};

fn insertedIntoOriginalEmptyGap(context: Insertion, owner: Owner, at: usize) !bool {
    const paragraph = context.paragraph;
    const span = context.span;
    if (span.tab_element != null or span.anchor_element != null or span.site_index >= paragraph.sites.items.len) return error.SourceBindingMismatch;
    var found = false;
    for (paragraph.character_styles orelse return error.SourceBindingMismatch) |candidate| {
        if (std.meta.eql(candidate, span)) found = true;
    }
    if (!found) return error.SourceBindingMismatch;
    const site = paragraph.sites.items[span.site_index];
    if (site.element_index != owner.text_element) return false;
    if (owner.element_index >= context.tree.elements.len or owner.text_element >= context.tree.elements.len) return error.SourceBindingMismatch;
    const marker = context.tree.elements[owner.element_index];
    const text = context.tree.elements[owner.text_element];
    const run = text.parent orelse return error.SourceBindingMismatch;
    if (run >= context.tree.elements.len or !@import("title_mark_axis.zig").retained(context.tree, owner.element_index) or marker.parent != owner.text_element or span.run_element != run or context.tree.elements[run].parent != paragraph.template_element) return error.SourceBindingMismatch;
    // Coordinates/style alone cannot prove a deleted partial fragment's identity.
    // This narrow proof is an original zero-byte gap immediately before this marker.
    if (site.start != site.end or site.start != marker.start_tag.start) return false;
    if (site.start < text.start_tag.end or site.start > (text.end_tag orelse return error.SourceBindingMismatch).start) return error.SourceBindingMismatch;
    if (site.missing_text or site.anchor_boundary or site.empty_element) return false;
    if (site.text.len != 0 or span.start_unit != at or span.end_unit != at or span.site_start_unit != at) return false;
    if (span.char_shape_id != owner.char_shape_id) return error.SourceBindingMismatch;
    for (paragraph.sites.items, 0..) |other, index| {
        if (index != span.site_index and other.element_index == site.element_index and other.start == site.start and other.end == site.end) return error.SourceBindingMismatch;
    }
    return true;
}

pub fn splice(a: std.mem.Allocator, input: []const Owner, at: usize, deleted: usize, inserted: usize) ![]Owner {
    return spliceAtInsertion(a, input, at, deleted, inserted, null);
}

pub fn spliceAtInsertion(a: std.mem.Allocator, input: []const Owner, at: usize, deleted: usize, inserted: usize, insertion: ?Insertion) ![]Owner {
    const change = try @import("../model/point_splice.zig").Change.init(at, deleted, inserted);
    const output = try a.dupe(Owner, input);
    errdefer a.free(output);
    for (output) |*owner| {
        if (owner.end_unit < owner.start_unit) return error.SourceBindingMismatch;
        if (inserted != 0 and owner.start_unit == at and owner.end_unit == at) {
            if (insertion) |context| if (try insertedIntoOriginalEmptyGap(context, owner.*, at)) {
                owner.start_unit = at;
                owner.end_unit = std.math.add(usize, at, inserted) catch return error.LimitExceeded;
                continue;
            };
        }
        owner.start_unit = try change.map(owner.start_unit, .right);
        owner.end_unit = try change.map(owner.end_unit, .right);
        if (owner.end_unit < owner.start_unit) return error.SourceBindingMismatch;
    }
    return output;
}

/// raw gap의 marker를 다른 style의 텍스트 뒤로 다시 귀속시키지 않습니다.
/// generic Output은 source_change_cursor와 출력 limit을 기존 writer와 공유합니다.
pub fn gap(a: std.mem.Allocator, tree: *const Tree, owners: ?[]const Owner, text_index: usize, run_index: usize, style: ?u32, high: usize, output: anytype) !void {
    const inventory = owners orelse return output.gap(high);
    const text = tree.elements[text_index];
    const text_end = text.end_tag orelse return error.SourceBindingMismatch;
    const run = tree.elements[run_index];
    const run_end = run.end_tag orelse return error.SourceBindingMismatch;
    var active_style = style;
    for (inventory, 0..) |owner, i| {
        if (owner.element_index >= tree.elements.len or owner.text_element >= tree.elements.len) return error.SourceBindingMismatch;
        for (inventory[0..i]) |before| if (before.element_index == owner.element_index) return error.SourceBindingMismatch;
        const marker = tree.elements[owner.element_index];
        if (!@import("title_mark_axis.zig").retained(tree, owner.element_index) or marker.parent != owner.text_element) return error.SourceBindingMismatch;
        if (owner.text_element != text_index or marker.start_tag.start < output.base + output.cursor.position or marker.end > high) continue;
        if (owner.char_shape_id == active_style) continue;
        try output.gap(marker.start_tag.start);
        try output.append(tree.source[text_end.start..text.end]);
        try output.append(tree.source[run_end.start..run.end]);
        const opening = if (owner.char_shape_id) |id|
            try @import("character_style_tag.zig").write(a, tree, run_index, id, output.limit -| output.bytes.items.len)
        else
            try a.dupe(u8, tree.source[run.start_tag.start..run.start_tag.end]);
        defer a.free(opening);
        try output.append(opening);
        try output.append(tree.source[text.start_tag.start..text.start_tag.end]);
        try output.gap(marker.end);
        active_style = owner.char_shape_id;
    }
    try output.gap(high);
}
