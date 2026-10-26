//! Ordered current pieces to one paragraph; output is transient, never state.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Joined = @import("paragraph_joined_values.zig").Joined;
const uri = @import("document_xml.zig").paragraph_uri;
const MetadataPermission = enum { plain, columns, columns_and_page_areas };

pub fn write(a: std.mem.Allocator, tree: *const Tree, current: *const Joined, options: @import("text_sites.zig").Options, limit: usize) ![]u8 {
    return writeMode(a, tree, current, options, limit, false, null, .plain, false);
}

pub fn writeWithTabs(a: std.mem.Allocator, tree: *const Tree, current: *const Joined, options: @import("text_sites.zig").Options, limit: usize) ![]u8 {
    return writeMode(a, tree, current, options, limit, true, null, .plain, false);
}

pub fn writeOwnedTabs(a: std.mem.Allocator, tree: *const Tree, current: *const Joined, options: @import("text_sites.zig").Options, limit: usize, owned: []const @import("paragraph_structure_values.zig").ProtectedPosition) ![]u8 {
    return writeMode(a, tree, current, options, limit, true, owned, .plain, false);
}

pub fn writeOwnedAnchors(a: std.mem.Allocator, tree: *const Tree, current: *const Joined, options: @import("text_sites.zig").Options, limit: usize, owned: []const @import("paragraph_structure_values.zig").ProtectedPosition) ![]u8 {
    return writeMode(a, tree, current, options, limit, true, owned, .plain, true);
}

/// 소유권/원본 바인딩이 검증된 다단 그룹 조립기 전용입니다.
pub fn writeOwnedColumnTabs(a: std.mem.Allocator, tree: *const Tree, current: *const Joined, options: @import("text_sites.zig").Options, limit: usize, owned: []const @import("paragraph_structure_values.zig").ProtectedPosition) ![]u8 {
    return writeMode(a, tree, current, options, limit, true, owned, .columns, false);
}

/// 원본 전체 객체/단 선언의 소유권은 호출하는 컬럼 조립기가 검증합니다.
pub fn writeOwnedColumnAnchors(a: std.mem.Allocator, tree: *const Tree, current: *const Joined, options: @import("text_sites.zig").Options, limit: usize, owned: []const @import("paragraph_structure_values.zig").ProtectedPosition) ![]u8 {
    return writeMode(a, tree, current, options, limit, true, owned, .columns, true);
}

/// 인접 원본들의 선언 소유권은 호출하는 혼합 조립기가 검증합니다.
pub fn writeWithColumnPageAreas(a: std.mem.Allocator, tree: *const Tree, current: *const Joined, options: @import("text_sites.zig").Options, limit: usize) ![]u8 {
    try @import("column_boundary_joined_provenance.zig").validate(tree, current);
    for (current.pieces) |piece| if (!piece.owns_source) return error.SourceBindingMismatch;
    return writeMode(a, tree, current, options, limit, false, null, .columns_and_page_areas, false);
}

/// 검증된 원본 그룹과 연결된 continuation만 선언 없는 본문으로 출력합니다.
pub fn writeColumnPageAreaContinuation(a: std.mem.Allocator, tree: *const Tree, original: *const Joined, current: *const Joined, id: u32, options: @import("text_sites.zig").Options, limit: usize) ![]u8 {
    try @import("column_boundary_joined_provenance.zig").validate(tree, original);
    try @import("column_boundary_joined_provenance.zig").validateContinuation(original, current, id);
    return writeMode(a, tree, current, options, limit, false, null, .columns_and_page_areas, false);
}

fn writeMode(a: std.mem.Allocator, tree: *const Tree, current: *const Joined, options: @import("text_sites.zig").Options, limit: usize, allow_tabs: bool, owned: ?[]const @import("paragraph_structure_values.zig").ProtectedPosition, column_metadata: MetadataPermission, anchors: bool) ![]u8 {
    try current.validate();
    if (allow_tabs and current.character_styles != null) return error.UnsupportedAnchoredStructure;
    for (current.pieces) |piece| if (piece.output != .current_runs or piece.template_only) return error.UnsupportedColumnBoundaryEdit;
    const positions = if (anchors) try @import("paragraph_joined_positions.zig").buildWithAnchors(a, tree, current) else if (allow_tabs) try @import("paragraph_joined_positions.zig").buildWithTabs(a, tree, current) else try @import("paragraph_joined_positions.zig").build(a, tree, current);
    defer a.free(positions);
    var parts: ?@import("paragraph_joined_tab_partition.zig").Parts = if (owned) |items| (if (anchors) try @import("paragraph_joined_tab_partition.zig").buildWithAnchors(a, tree, current, items) else try @import("paragraph_joined_tab_partition.zig").build(a, tree, current, items)) else null;
    defer if (parts) |*value| value.deinit(a);
    var left = try current.paragraph(0);
    if (parts) |value| left.protected_positions = value.items[0];
    const left_styles = try @import("character_style_piece.zig").partition(a, current, 0);
    defer if (left_styles) |styles| a.free(styles);
    left.character_styles = left_styles;
    const node = tree.elements[left.template_element];
    if (node.name.local.encoding != .utf8) return error.UnsupportedEditEncoding;
    const closing = node.end_tag orelse return error.InvalidParagraphElement;
    const serialized = if (parts != null)
        try @import("paragraph_split_xml.zig").writeProtected(a, tree, &left, options, limit)
    else if (allow_tabs)
        try @import("paragraph_split_xml.zig").writeSitesWithTabs(a, tree, &left, options, limit)
    else if (left_styles != null)
        try @import("character_style_paragraph_xml.zig").writeFieldsDirtyOptions(a, tree, &left, &.{}, options, limit)
    else
        try @import("paragraph_split_xml.zig").writeSitesWithOptions(a, tree, left.template_element, &left.sites, options, left.generated_id != null, left.generated_id orelse 0, limit);
    defer a.free(serialized);
    const end_size = closing.end - closing.start;
    if (end_size > serialized.len) return error.SourceBindingMismatch;
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    try append(a, &out, serialized[0 .. serialized.len - end_size], limit);
    for (1..current.pieces.len) |index| {
        var paragraph = try current.paragraph(index);
        if (parts) |value| paragraph.protected_positions = value.items[index];
        const styles = try @import("character_style_piece.zig").partition(a, current, index);
        defer if (styles) |items| a.free(items);
        paragraph.character_styles = styles;
        if (column_metadata != .plain) {
            if (column_metadata == .columns_and_page_areas) try @import("column_boundary_joined_metadata.zig").validateRightWithPageAreas(tree, current.pieces[index].template_element) else if (anchors) try @import("column_boundary_joined_metadata.zig").validateRightWithAnchors(tree, current.pieces[index].template_element) else try @import("column_boundary_joined_metadata.zig").validateRight(tree, current.pieces[index].template_element);
        } else if (anchors) try @import("paragraph_joined_boundary.zig").validateWithAnchors(a, tree, current, index) else if (allow_tabs) try @import("paragraph_joined_boundary.zig").validateWithTabs(a, tree, current, index) else try @import("paragraph_joined_boundary.zig").validate(a, tree, current, index);
        const source = tree.elements[paragraph.template_element];
        if (source.name.local.encoding != .utf8) return error.UnsupportedEditEncoding;
        const end_tag = source.end_tag orelse return error.InvalidParagraphElement;
        var cursor = source.start_tag.end;
        var child = source.first_child;
        while (child) |element_index| : (child = tree.elements[element_index].next_sibling) {
            const element = tree.elements[element_index];
            try append(a, &out, tree.source[cursor..element.start_tag.start], limit);
            if (element.is(uri, "run")) {
                var selected_styles: ?[]const @import("character_style_paint.zig").Span = null;
                if (styles) |items| {
                    var first: ?usize = null;
                    var last: usize = 0;
                    for (items, 0..) |span, ordinal| if (span.run_element == element_index) {
                        if (first == null) first = ordinal;
                        last = ordinal + 1;
                    };
                    if (first) |begin| selected_styles = items[begin..last];
                }
                const run = if (parts != null)
                    try @import("run_current_protected_xml.zig").write(a, tree, &paragraph, element_index, options, limit -| out.items.len)
                else if (allow_tabs)
                    try @import("run_current_xml.zig").writeWithTabs(a, tree, &paragraph, element_index, options, limit -| out.items.len, paragraph.generated_id != null)
                else if (selected_styles) |items|
                    try @import("character_style_run_closed.zig").write(a, tree, &paragraph.sites, items, limit -| out.items.len)
                else
                    try @import("run_current_xml.zig").writeMode(a, tree, &paragraph, element_index, options, limit -| out.items.len, paragraph.generated_id != null);
                defer a.free(run);
                try append(a, &out, run, limit);
            } else if (!element.is(uri, "linesegarray")) return error.UnsupportedMergeMetadata;
            cursor = element.end;
        }
        try append(a, &out, tree.source[cursor..end_tag.start], limit);
    }
    try append(a, &out, serialized[serialized.len - end_size ..], limit);
    return out.toOwnedSlice(a);
}

fn append(a: std.mem.Allocator, out: *std.ArrayList(u8), bytes: []const u8, limit: usize) !void {
    if (bytes.len > limit -| out.items.len) return error.LimitExceeded;
    try out.appendSlice(a, bytes);
}
