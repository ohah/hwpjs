//! Text and style values are committed together; immutable XML is untouched.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const paint = @import("character_style_paint.zig");

/// Plain note styles omit the retained number, while anchor requests include it.
/// Preserve the anchor-selected insertion site when translating coordinates.
pub fn spliceAnchored(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, paragraph: *model.Paragraph, start: u32, deleted: u32, inserted: []const u8, limit: usize) !bool {
    for (paragraph.character_styles orelse return error.InvalidTextSites) |span| {
        if (span.anchor_element != null) return splice(a, tree, paragraph, start, deleted, inserted, limit);
    }
    if (paragraph.generated_id != null) return splice(a, tree, paragraph, start, deleted, inserted, limit);
    const locations = try @import("paragraph_structure_locations.zig").build(a, tree, paragraph);
    defer a.free(locations);
    const anchors = try @import("anchor_paragraph_edit.zig").segments(a, tree, &paragraph.sites, locations, 1);
    defer a.free(anchors);
    const end = std.math.add(u32, start, deleted) catch return error.InvalidTextPosition;
    try @import("paragraph_text_positions.zig").validateRange(anchors, start, end);
    const target = @import("text_splice_transaction.zig").insertionSite(&paragraph.sites, anchors, start) orelse return error.InvalidTextPosition;
    try @import("plain_paragraph_policy.zig").validateWithTabs(tree, &paragraph.sites, locations, 1, true);
    const plain = try @import("paragraph_text_positions.zig").build(a, tree, &paragraph.sites, locations, 1);
    defer a.free(plain);
    var mapped_start = start;
    var mapped_end = end;
    for (anchors) |segment| {
        if (segment.kind != .anchor) continue;
        if (segment.end_unit <= start) mapped_start -= 1;
        if (segment.end_unit <= end) mapped_end -= 1;
    }
    return splicePositionsAtSite(a, paragraph, plain, mapped_start, mapped_end - mapped_start, inserted, limit, target);
}
pub fn splice(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, paragraph: *model.Paragraph, start: u32, deleted: u32, inserted: []const u8, limit: usize) !bool {
    if (paragraph.pieces != null) return error.UnsupportedStructuralCharacterStyle;
    const locations = try @import("paragraph_structure_locations.zig").build(a, tree, paragraph);
    defer a.free(locations);
    var has_anchors = false;
    for (paragraph.character_styles orelse return error.InvalidTextSites) |span| if (span.anchor_element != null) {
        has_anchors = true;
    };
    const positions = if (has_anchors)
        try @import("anchor_paragraph_edit.zig").segments(a, tree, &paragraph.sites, locations, 1)
    else block: {
        try @import("plain_paragraph_policy.zig").validateWithTabs(tree, &paragraph.sites, locations, 1, true);
        break :block try @import("paragraph_text_positions.zig").build(a, tree, &paragraph.sites, locations, 1);
    };
    defer a.free(positions);
    return splicePositions(a, paragraph, positions, start, deleted, inserted, limit);
}

pub fn splicePositions(a: std.mem.Allocator, paragraph: *model.Paragraph, positions: []const @import("paragraph_text_positions.zig").Segment, start: u32, deleted: u32, inserted: []const u8, limit: usize) !bool {
    const target = @import("text_splice_transaction.zig").insertionSite(&paragraph.sites, positions, start) orelse return error.InvalidTextPosition;
    return splicePositionsAtSite(a, paragraph, positions, start, deleted, inserted, limit, target);
}

/// A field consumer supplies its validated inside-field insertion affinity.
pub fn splicePositionsAtSite(a: std.mem.Allocator, paragraph: *model.Paragraph, positions: []const @import("paragraph_text_positions.zig").Segment, start: u32, deleted: u32, inserted: []const u8, limit: usize, target: usize) !bool {
    const current = paragraph.character_styles orelse return error.InvalidTextSites;
    const end = std.math.add(u32, start, deleted) catch return error.InvalidTextPosition;
    var draft = try paragraph.clone(a);
    defer draft.deinit(a);
    if (!try @import("text_splice_transaction.zig").spliceProjected(a, &draft.sites, positions, start, deleted, inserted, limit, target)) return false;
    const inserted_units = try @import("text_site_edit.zig").utf16Length(inserted);
    try @import("title_mark_splice_current.zig").apply(a, &draft, start, deleted, inserted_units);
    var output: std.ArrayList(paint.Span) = .empty;
    defer output.deinit(a);
    var index: usize = 0;
    var new_base: usize = 0;
    for (positions) |position| {
        if (@import("paragraph_text_positions.zig").isInlineUnit(position) or position.kind == .anchor) {
            if (index >= current.len) return error.InvalidTextSites;
            var tab = current[index];
            const element = if (@import("paragraph_text_positions.zig").isInlineUnit(position)) tab.tab_element else tab.anchor_element;
            if (element != position.index or tab.start_unit != position.start_unit or tab.end_unit != position.end_unit or tab.end_unit - tab.start_unit != 1) return error.InvalidTextSites;
            tab.start_unit = new_base;
            tab.end_unit = std.math.add(usize, new_base, 1) catch return error.LimitExceeded;
            tab.site_start_unit = new_base;
            try paint.append(a, &output, tab, 1_000_000);
            new_base = tab.end_unit;
            index += 1;
            continue;
        }
        if (position.kind != .text or index >= current.len) return error.InvalidTextSites;
        const first = current[index];
        if (first.tab_element != null or first.anchor_element != null or first.site_index != position.index or first.site_start_unit != position.start_unit) return error.InvalidTextSites;
        const low = std.math.clamp(@as(usize, start), position.start_unit, position.end_unit);
        const high = std.math.clamp(@as(usize, end), position.start_unit, position.end_unit);
        var cursor = new_base;
        var old_cursor = position.start_unit;
        var added = false;
        while (index < current.len and current[index].site_index == position.index) : (index += 1) {
            const span = current[index];
            if (span.tab_element != null or span.anchor_element != null or span.start_unit != old_cursor or span.end_unit < span.start_unit or span.end_unit > position.end_unit or span.run_element != first.run_element or span.site_start_unit != first.site_start_unit) return error.InvalidTextSites;
            _ = try @import("text_site_edit.zig").bytePosition(paragraph.sites.items[position.index].text, std.math.cast(u32, span.end_unit - position.start_unit) orelse return error.LimitExceeded);
            try emit(a, &output, span, new_base, &cursor, @min(span.end_unit, low) -| span.start_unit);
            if (!added and position.index == target and low >= span.start_unit and low <= span.end_unit) {
                try emit(a, &output, span, new_base, &cursor, inserted_units);
                added = true;
            }
            try emit(a, &output, span, new_base, &cursor, span.end_unit -| @max(span.start_unit, high));
            old_cursor = span.end_unit;
        }
        if (old_cursor != position.end_unit or (position.index == target and !added)) return error.InvalidTextSites;
        if (cursor == new_base) {
            var empty = first;
            empty.start_unit = new_base;
            empty.end_unit = new_base;
            empty.site_start_unit = new_base;
            try paint.append(a, &output, empty, 1_000_000);
        }
        new_base = cursor;
    }
    if (index != current.len) return error.InvalidTextSites;
    const styles = try output.toOwnedSlice(a);
    a.free(draft.character_styles.?);
    draft.character_styles = styles;
    std.mem.swap(model.Paragraph, paragraph, &draft);
    return true;
}
fn emit(a: std.mem.Allocator, output: *std.ArrayList(paint.Span), source: paint.Span, base: usize, cursor: *usize, length: usize) !void {
    if (length == 0) return;
    var span = source;
    span.start_unit = cursor.*;
    span.end_unit = std.math.add(usize, cursor.*, length) catch return error.LimitExceeded;
    span.site_start_unit = base;
    try paint.append(a, output, span, 1_000_000);
    cursor.* = span.end_unit;
}
