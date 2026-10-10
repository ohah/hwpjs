//! 단 그룹의 나머지 문단을 공통 원본 바인딩을 가진 joined 모델로 연결합니다.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const Tree = @import("xml_part_tree.zig").Tree;

pub fn install(a: std.mem.Allocator, tree: *const Tree, paragraphs: []model.Paragraph, anchor: usize, limit: usize) !void {
    if (anchor >= paragraphs.len) return error.InvalidParagraphIndex;
    const joined = paragraphs[anchor].joined() orelse return error.MissingJoinedParagraph;
    const binding = try joined.paragraph(0);
    for (paragraphs, 0..) |*paragraph, index| {
        if (index == anchor) continue;
        if (paragraph.pieces != null or paragraph.protected_positions != null or paragraph.template_element != binding.template_element) return error.SourceBindingMismatch;
        var aligned = try @import("paragraph_site_union.zig").prepare(a, tree, binding.template_element, &binding.sites, &paragraph.sites, limit);
        defer aligned.left.deinit(a);
        var installed = false;
        defer if (!installed) aligned.right.deinit(a);
        const styles = try @import("character_style_site_union.zig").prepare(a, tree, paragraph, &aligned.right);
        errdefer if (styles) |items| a.free(items);
        const pieces = try a.alloc(@import("paragraph_joined_values.zig").Piece, 1);
        pieces[0] = .{ .template_element = paragraph.template_element, .source_ordinal = paragraph.source_ordinal, .generated_id = paragraph.generated_id, .first_site = 0, .site_count = aligned.right.items.len, .owns_source = paragraph.generated_id == null };
        paragraph.sites.deinit(a);
        if (paragraph.character_styles) |items| a.free(items);
        paragraph.sites = aligned.right;
        paragraph.character_styles = styles;
        paragraph.pieces = pieces;
        paragraph.column_structure_changed = true;
        installed = true;
    }
}
