//! Joined serialization retains every source column control at current coordinates.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;

pub fn write(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, options: @import("text_sites.zig").Options, limit: usize) ![]u8 {
    return writeMode(a, tree, paragraph, options, limit, false);
}

pub fn writeWithTabs(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, options: @import("text_sites.zig").Options, limit: usize) ![]u8 {
    return writeMode(a, tree, paragraph, options, limit, true);
}

/// 원본 전체를 소유한 객체/컬럼 병합 후보의 transient 저장입니다.
pub fn writeWithAnchors(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, options: @import("text_sites.zig").Options, limit: usize) ![]u8 {
    const joined = paragraph.joined() orelse return error.MissingJoinedParagraph;
    const boundaries = paragraph.column_boundaries orelse return error.MissingColumnBoundaries;
    const protected = paragraph.protected_positions orelse return error.SourceBindingMismatch;
    if (paragraph.generated_id != null) return error.UnsupportedColumnBoundaryEdit;
    try @import("column_boundary_joined_provenance.zig").validate(tree, &joined);
    try @import("column_boundary_joined_partition.zig").validateWithAnchors(a, tree, &joined, boundaries);
    try @import("paragraph_joined_tab_group.zig").validateWithAnchors(a, tree, paragraph[0..1]);
    const actual = try @import("column_boundary_joined_collect.zig").collectWithAnchors(a, tree, &joined, tree.elements.len);
    defer a.free(actual);
    const base = try @import("paragraph_joined_xml.zig").writeOwnedColumnAnchors(a, tree, &joined, options, limit, protected);
    defer a.free(base);
    for (actual, boundaries) |source, current| if (source.unit != current.unit)
        return @import("column_boundary_joined_relocate.zig").write(a, tree, base, boundaries, limit);
    return a.dupe(u8, base);
}

fn writeMode(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, options: @import("text_sites.zig").Options, limit: usize, allow_tabs: bool) ![]u8 {
    const joined = paragraph.joined() orelse return error.MissingJoinedParagraph;
    const boundaries = paragraph.column_boundaries orelse return error.MissingColumnBoundaries;
    if (paragraph.protected_positions != null or paragraph.generated_id != null) return error.UnsupportedColumnBoundaryEdit;
    if (allow_tabs) try @import("column_boundary_joined_partition.zig").validateWithTabs(a, tree, &joined, boundaries) else try @import("column_boundary_joined_partition.zig").validate(a, tree, &joined, boundaries);
    const current = if (allow_tabs) try @import("column_boundary_joined_collect.zig").collectWithTabs(a, tree, &joined, tree.elements.len) else try @import("column_boundary_joined_collect.zig").collect(a, tree, &joined, tree.elements.len);
    defer a.free(current);
    var relocation = false;
    for (current, boundaries) |actual, expected| if (actual.unit != expected.unit) {
        relocation = true;
    };
    const base = try writeBaseMode(a, tree, paragraph, options, limit, allow_tabs);
    defer a.free(base);
    if (relocation) return @import("column_boundary_joined_relocate.zig").write(a, tree, base, boundaries, limit);
    return a.dupe(u8, base);
}

/// Transient assembly only; callers validate the full column ownership group.
/// Original owners retain controls, generated continuations remove inherited ones.
pub fn writeBase(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, options: @import("text_sites.zig").Options, limit: usize) ![]u8 {
    return writeBaseMode(a, tree, paragraph, options, limit, false);
}

fn writeBaseMode(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, options: @import("text_sites.zig").Options, limit: usize, allow_tabs: bool) ![]u8 {
    const joined = paragraph.joined() orelse return error.MissingJoinedParagraph;
    try joined.validate();
    if (allow_tabs and paragraph.character_styles != null) return error.UnsupportedAnchoredStructure;
    const positions = if (allow_tabs) try @import("paragraph_joined_positions.zig").buildWithTabs(a, tree, &joined) else try @import("paragraph_joined_positions.zig").build(a, tree, &joined);
    defer a.free(positions);
    if (paragraph.protected_positions != null) return error.UnsupportedColumnBoundaryEdit;
    var first = try joined.paragraph(0);
    const first_styles = if (joined.pieces[0].template_only) null else try @import("character_style_piece.zig").partition(a, &joined, 0);
    defer if (first_styles) |styles| a.free(styles);
    first.character_styles = first_styles;
    if (first.template_element != paragraph.template_element or first.source_ordinal != paragraph.source_ordinal or first.generated_id != paragraph.generated_id) return error.SourceBindingMismatch;
    const continuation = paragraph.generated_id != null;
    if (!continuation) {
        try @import("column_boundary_joined_provenance.zig").validate(tree, &joined);
    } else {
        for (joined.pieces) |piece| {
            if (piece.generated_id != paragraph.generated_id or piece.owns_source or piece.source_ordinal != null) return error.SourceBindingMismatch;
        }
    }
    var styled_source = first;
    styled_source.generated_id = null;
    const serialized_source = if (first_styles != null)
        try @import("character_style_paragraph_xml.zig").writeFieldsDirtyOptions(a, tree, &styled_source, &.{}, options, limit)
    else if (allow_tabs)
        try @import("paragraph_split_xml.zig").writeSitesWithTabs(a, tree, &first, options, limit)
    else
        try @import("paragraph_split_xml.zig").writeSitesWithOptions(a, tree, first.template_element, &first.sites, options, continuation, paragraph.generated_id orelse 0, limit);
    defer a.free(serialized_source);
    const styled_continuation = if (first_styles != null and continuation) try @import("styled_continuation_xml.zig").paragraph(a, tree, serialized_source, paragraph.generated_id.?, limit) else null;
    defer if (styled_continuation) |bytes| a.free(bytes);
    const serialized = styled_continuation orelse serialized_source;
    const shell = if (joined.pieces[0].template_only) try @import("paragraph_shell_xml.zig").write(a, tree, serialized, limit) else null;
    defer if (shell) |bytes| a.free(bytes);
    const base = shell orelse serialized;
    const closing = tree.elements[first.template_element].end_tag orelse return error.InvalidParagraphElement;
    const closing_size = closing.end - closing.start;
    if (closing_size > base.len) return error.SourceBindingMismatch;
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    try append(a, &output, base[0 .. base.len - closing_size], limit);
    for (joined.pieces[1..], 1..) |piece, index| {
        if (piece.output == .inventory_only or piece.template_only) continue;
        var part = try joined.paragraph(index);
        const styles = try @import("character_style_piece.zig").partition(a, &joined, index);
        defer if (styles) |items| a.free(items);
        part.character_styles = styles;
        const owned = if (piece.output == .source_runs) paragraph.column_boundaries orelse return error.MissingColumnBoundaries else null;
        if (allow_tabs) try @import("column_boundary_piece_xml.zig").appendSelectedWithTabs(a, tree, &part, piece.owns_source or piece.output == .source_runs, owned, options, &output, limit) else try @import("column_boundary_piece_xml.zig").appendSelected(a, tree, &part, piece.owns_source or piece.output == .source_runs, owned, options, &output, limit);
    }
    try append(a, &output, base[base.len - closing_size ..], limit);
    return output.toOwnedSlice(a);
}

fn append(a: std.mem.Allocator, output: *std.ArrayList(u8), bytes: []const u8, limit: usize) !void {
    if (bytes.len > limit -| output.items.len) return error.LimitExceeded;
    try output.appendSlice(a, bytes);
}
