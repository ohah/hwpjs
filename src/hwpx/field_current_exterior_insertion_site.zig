//! explicit current 그룹을 검증한 뒤 필드 외부 교체의 삽입 site만 선택합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Values = @import("paragraph_structure_values.zig").Values;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Sites = @import("text_sites.zig");
const Fields = @import("field_markers.zig");
const Segment = @import("paragraph_text_positions.zig").Segment;
const Tx = @import("text_splice_transaction.zig");
const Point = struct { row: usize, piece: usize, source: usize };

fn less(a: Point, b: Point) bool {
    if (a.row != b.row) return a.row < b.row;
    if (a.piece != b.piece) return a.piece < b.piece;
    return a.source < b.source;
}
const pieceOfSite = @import("field_canonical_bindings.zig").pieceOfSite;
fn markerPoint(tree: *const Tree, current: *const Values, projection: *const @import("field_current_spans.zig").Projection, element: usize, begin: usize, kind: Fields.Kind) !Point {
    if (element >= tree.elements.len) return error.SourceBindingMismatch;
    const projected = projection.points.get(element) orelse return error.SourceBindingMismatch;
    if (projected.row >= current.paragraphs.len or projected.marker.element_index != element or projected.marker.begin_element != begin or projected.marker.kind != kind or projected.marker.unit != projected.unit) return error.SourceBindingMismatch;
    const row = &current.paragraphs[projected.row];
    if (projected.inherited) {
        // source offset으로 현재 행을 찾지 않습니다. 공유 투영이 검증한 행만 사용합니다.
        if (row.field_positions != null or row.pieces != null or row.generated_id != null or row.source_ordinal == null) return error.SourceBindingMismatch;
        // Inherited canonical binding was validated at projection construction.
    } else if (row.field_positions == null) return error.SourceBindingMismatch;
    const owner = try @import("paragraph_site_owner.zig").ancestor(tree, element);
    var piece_index: usize = 0;
    if (row.joined()) |joined| {
        var selected: ?usize = null;
        for (joined.pieces, 0..) |piece, index| {
            if (piece.template_element != owner) continue;
            if (selected != null or piece.output != .current_runs or piece.template_only) return error.SourceBindingMismatch;
            selected = index;
        }
        piece_index = selected orelse return error.SourceBindingMismatch;
    } else if (owner != row.template_element) return error.SourceBindingMismatch;
    return .{ .row = projected.row, .piece = piece_index, .source = if (kind == .begin) tree.elements[element].end else tree.elements[element].start_tag.start };
}

fn sitePoint(row: *const Paragraph, index: usize, site: usize) !Point {
    const piece = try pieceOfSite(row, site);
    return .{ .row = index, .piece = piece, .source = row.sites.items[site].start };
}
fn protected(projection: *const @import("field_current_spans.zig").Projection, tree: *const Tree, current: *const Values, ranges: []const @import("field_text_ranges.zig").Range, report: *const Fields.Report, section: usize, point: Point, spans: []const @import("field_current_spans.zig").Span, unit: u32) !bool {
    var result = false;
    for (ranges) |field| {
        if (field.section != section) continue;
        // 숫자 범위가 아닌 현재 row/piece/원본 binding의 마커 순서입니다.
        const begin_element = report.markers[field.begin_marker].element_index;
        var relevant = false;
        for (spans) |span| {
            if (span.begin_element == begin_element and span.paragraph_index == point.row and span.start <= unit and unit <= span.end) relevant = true;
        }
        if (!relevant) continue;
        const end_element = report.markers[field.end_marker].element_index;
        const begin = try markerPoint(tree, current, projection, begin_element, begin_element, .begin);
        const end = try markerPoint(tree, current, projection, end_element, begin_element, .end);
        if (less(end, begin)) return error.InvalidFieldLinks;
        if (!less(point, begin) and less(point, end)) result = true;
    }
    return result;
}

/// 호출자가 준 report도 strict range/current topology 검증을 거칩니다.
pub fn select(a: std.mem.Allocator, trees: []const Tree, section: usize, current: *const Values, index: usize, report: *const Fields.Report, start: u32, deleted: u32, options: Sites.Options, limit: usize) !usize {
    if (section >= trees.len) return error.InvalidSectionIndex;
    if (index >= current.paragraphs.len) return error.InvalidParagraphIndex;
    if (current.paragraphs[index].field_positions == null) return error.UnsupportedStructuralFieldEdit;
    var projection = try @import("field_current_spans.zig").projectForExterior(a, trees, section, current, index, report, options, limit);
    defer projection.deinit(a);
    return selectProjected(a, trees, section, current, index, report, start, deleted, &projection);
}

/// query/mutation은 같은 호출에서 얻은 strict 투영만 빌려 공유합니다.
pub fn selectProjected(a: std.mem.Allocator, trees: []const Tree, section: usize, current: *const Values, index: usize, report: *const Fields.Report, start: u32, deleted: u32, projection: *const @import("field_current_spans.zig").Projection) !usize {
    if (section >= trees.len) return error.InvalidSectionIndex;
    if (index >= current.paragraphs.len) return error.InvalidParagraphIndex;
    const row = &current.paragraphs[index];
    if (row.field_positions == null) return error.UnsupportedStructuralFieldEdit;
    const tree = &trees[section];
    const inventory = if (projection.canonical) |*context| context else return error.SourceBindingMismatch;
    const spans = projection.spans;
    try @import("field_outside_range.zig").validate(spans, index, start, deleted);
    const segments = try @import("field_owned_positions.zig").build(a, tree, row);
    defer a.free(segments);
    for (segments) |segment| if (segment.kind != .text) return error.UnsupportedInlineControl;
    const end = std.math.add(u32, start, deleted) catch return error.InvalidTextPosition;
    try @import("paragraph_text_positions.zig").validateBoundary(&row.sites, segments, start);
    try @import("paragraph_text_positions.zig").validateBoundary(&row.sites, segments, end);
    const left = Tx.insertionSite(&row.sites, segments, start) orelse return error.InvalidTextPosition;
    if (deleted == 0) return left;
    var at_end = false;
    for (spans) |span| if (span.paragraph_index == index and span.end == start) {
        at_end = true;
    };
    if (!at_end) return left;
    try inventory.validateRow(a, row);
    const ranges = try @import("field_text_ranges.zig").build(a, trees, report);
    defer a.free(ranges);
    if (!try protected(projection, tree, current, ranges, report, section, try sitePoint(row, index, left), spans, start)) return left;
    const right = Tx.replacementInsertionSite(&row.sites, segments, start, deleted) orelse return error.InvalidTextPosition;
    var real_deleted_text = false;
    for (segments) |segment| {
        if (segment.kind == .text and segment.index == right and segment.start_unit <= start and start < segment.end_unit) real_deleted_text = true;
    }
    if (!real_deleted_text) return error.InvalidTextPosition;
    if (try protected(projection, tree, current, ranges, report, section, try sitePoint(row, index, right), spans, start)) return error.ProtectedFieldRange;
    return right;
}

// 모델 반례입니다. 실제 XML에서 generic left가 이 빈 site를 고르는 증거와 구분합니다.
test "current exterior owner co-located empty sites use event order not width" {
    const end: Point = .{ .row = 1, .piece = 0, .source = 100 };
    const inside_empty: Point = .{ .row = 1, .piece = 0, .source = 90 };
    const outside_empty: Point = .{ .row = 1, .piece = 0, .source = 110 };
    try std.testing.expect(less(inside_empty, end));
    try std.testing.expect(!less(outside_empty, end));
    // refresh의 엄격한 source_start < marker.start 순서와 같은 동률 판정입니다.
    try std.testing.expect(!less(end, end));
    try std.testing.expect(less(.{ .row = 1, .piece = 0, .source = 999 }, .{ .row = 1, .piece = 1, .source = 1 }));
    try std.testing.expect(less(.{ .row = 0, .piece = 9, .source = 999 }, end));
}
