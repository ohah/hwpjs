//! 텍스트 병합의 실제 사이트 재배치를 사용해 현재 서식을 옮깁니다.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const paint = @import("character_style_paint.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const Segment = @import("paragraph_text_positions.zig").Segment;
const Move = @import("paragraph_protected_merge_text.zig").Move;

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, output: *const model.Paragraph, left: *const model.Paragraph, right: *const model.Paragraph, left_segments: []const Segment, right_segments: []const Segment, moves: []const Move, limit: usize) ![]paint.Span {
    const segments = try @import("paragraph_protected_positions.zig").build(a, tree, output);
    defer a.free(segments);
    return preparePositions(a, tree, output, left, right, left_segments, right_segments, segments, moves, limit);
}

/// 원본 위치 투영은 호출자가 선택하며 서식 재배치 알고리즘은 공유합니다.
pub fn preparePositions(a: std.mem.Allocator, tree: *const Tree, output: *const model.Paragraph, left: *const model.Paragraph, right: *const model.Paragraph, left_segments: []const Segment, right_segments: []const Segment, segments: []const Segment, moves: []const Move, limit: usize) ![]paint.Span {
    const one = try partition(a, tree, left, left_segments, limit);
    defer a.free(one);
    const two = try partition(a, tree, right, right_segments, limit);
    defer a.free(two);
    const defaults = try partition(a, tree, output, segments, limit);
    defer a.free(defaults);
    var result: std.ArrayList(paint.Span) = .empty;
    defer result.deinit(a);
    for (segments, defaults) |segment, fallback| {
        if (segment.kind != .text) {
            var found: ?paint.Span = null;
            for ([_][]const paint.Span{ one, two }) |styles| for (styles) |span| {
                if ((if (segment.kind == .anchor) span.anchor_element else span.tab_element) == segment.index) {
                    if (found != null) return error.SourceBindingMismatch;
                    found = span;
                }
            };
            var span = found orelse return error.InvalidTextSites;
            span.start_unit = segment.start_unit;
            span.end_unit = segment.end_unit;
            span.site_start_unit = segment.start_unit;
            try paint.append(a, &result, span, limit);
            continue;
        }
        if (segment.start_unit == segment.end_unit) {
            var empty = fallback;
            var changed = false;
            for (moves) |move| {
                if (move.target_site != segment.index) continue;
                const paragraph = if (move.side == 0) left else right;
                if (paragraph.character_styles == null) continue;
                const styles = if (move.side == 0) one else two;
                for (styles) |span| {
                    if (span.anchor_element == null and span.tab_element == null and span.site_index == move.source_site and span.start_unit == span.end_unit and span.char_shape_id != fallback.char_shape_id) {
                        if (changed and empty.char_shape_id != span.char_shape_id) return error.UnsupportedAnchoredStructure;
                        empty.char_shape_id = span.char_shape_id;
                        changed = true;
                    }
                }
            }
            try paint.append(a, &result, empty, limit);
            continue;
        }
        var cursor = segment.start_unit;
        for (moves) |move| {
            if (move.target_site != segment.index) continue;
            const styles = if (move.side == 0) one else two;
            for (styles) |source| {
                if (source.anchor_element != null or source.tab_element != null or source.site_index != move.source_site or source.start_unit == source.end_unit) continue;
                if (source.start_unit < move.source_start or source.end_unit < source.start_unit) return error.InvalidTextSites;
                var span = source;
                span.site_index = segment.index;
                span.site_start_unit = segment.start_unit;
                const base = std.math.add(usize, segment.start_unit, move.target_offset) catch return error.LimitExceeded;
                span.start_unit = std.math.add(usize, base, source.start_unit - move.source_start) catch return error.LimitExceeded;
                span.end_unit = std.math.add(usize, base, source.end_unit - move.source_start) catch return error.LimitExceeded;
                if (span.start_unit != cursor or span.end_unit > segment.end_unit or span.run_element != fallback.run_element) return error.InvalidTextSites;
                try paint.append(a, &result, span, limit);
                cursor = span.end_unit;
            }
        }
        if (cursor != segment.end_unit) return error.InvalidTextSites;
    }
    return result.toOwnedSlice(a);
}

fn partition(a: std.mem.Allocator, tree: *const Tree, paragraph: *const model.Paragraph, segments: []const Segment, limit: usize) ![]paint.Span {
    if (paragraph.character_styles) |styles| return a.dupe(paint.Span, styles);
    const typed = try @import("character_style_anchor_projection.zig").build(a, tree, &paragraph.sites, segments, limit);
    defer a.free(typed);
    return @import("character_style_anchor_adapter.zig").fromTyped(a, tree, &paragraph.sites, typed);
}
