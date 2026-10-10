//! 필드 분할 그룹에서 현재 필드 범위 밖 문단의 일반 입력을 처리합니다.
const std = @import("std");

pub fn positions(self: anytype, section_index: usize, index: usize) ![]@import("paragraph_text_positions.zig").Segment {
    const a = self.allocator;
    const section = &self.sections[section_index];
    const current = &section.structure_values.?;
    const row = &current.paragraphs[index];
    const markers = row.field_positions orelse return error.UnsupportedStructuralFieldEdit;
    if (markers.len != 0 or row.protected_positions != null or row.column_boundaries != null) return error.UnsupportedStructuralFieldEdit;
    if (section.sites.items.len != 0) return error.DuplicateCurrentTextOwner;
    const trees = try a.alloc(@import("xml_part_tree.zig").Tree, self.sections.len);
    defer a.free(trees);
    for (self.sections, trees) |part, *tree| tree.* = part.tree;
    var report = try @import("field_markers.zig").inspect(a, trees, .{});
    defer report.deinit();
    const spans = try @import("field_current_spans.zig").buildForExterior(a, trees, section_index, current, index, &report, 200_000);
    defer a.free(spans);
    for (spans) |span| if (span.paragraph_index == index) return error.UnsupportedStructuralFieldEdit;
    const result = if (row.pieces != null)
        try @import("field_owned_positions.zig").build(a, &section.tree, row)
    else block: {
        const locations = try @import("paragraph_structure_locations.zig").build(a, &section.tree, row);
        defer a.free(locations);
        try @import("plain_paragraph_policy.zig").validateForCharacterFormat(&section.tree, &row.sites, locations, 1);
        break :block try @import("paragraph_text_positions.zig").build(a, &section.tree, &row.sites, locations, 1);
    };
    errdefer a.free(result);
    for (result) |segment| if (segment.kind != .text) return error.UnsupportedInlineControl;
    return result;
}

pub fn splice(self: anytype, section_index: usize, index: usize, start: u32, deleted: u32, inserted: []const u8, section_limit: usize) !bool {
    const a = self.allocator;
    const segments = try positions(self, section_index, index);
    defer a.free(segments);
    const current = &self.sections[section_index].structure_values.?;
    var other: usize = 0;
    for (current.paragraphs, 0..) |row, ordinal| {
        if (ordinal == index) continue;
        for (row.sites.items) |site| {
            if (site.text.len > section_limit -| other) return error.LimitExceeded;
            other += site.text.len;
        }
    }
    if (current.paragraphs[index].character_styles != null) return @import("character_style_splice.zig").splicePositions(a, &current.paragraphs[index], segments, start, deleted, inserted, section_limit -| other);
    return @import("text_splice_transaction.zig").spliceProjected(a, &current.paragraphs[index].sites, segments, start, deleted, inserted, section_limit -| other, null);
}

pub fn text(self: anytype, section_index: usize, index: usize) ![]u8 {
    const a = self.allocator;
    const segments = try positions(self, section_index, index);
    defer a.free(segments);
    const sites = &self.sections[section_index].structure_values.?.paragraphs[index].sites;
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    for (segments) |segment| {
        const bytes = @import("paragraph_text_positions.zig").segmentText(sites, segment);
        if (bytes.len > self.options.max_text_bytes -| output.items.len) return error.LimitExceeded;
        try output.appendSlice(a, bytes);
    }
    return output.toOwnedSlice(a);
}
