//! 원본 문단 출처를 현재 문단 순서에 연결합니다. 표시 캐시는 소유하지 않습니다.
const std = @import("std");
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;

pub fn matchesTemplate(paragraph: *const Paragraph, template: usize) !bool {
    if (paragraph.joined()) |joined| {
        try joined.validate();
        for (joined.pieces) |piece| if (piece.template_element == template) return true;
        return false;
    }
    return paragraph.template_element == template;
}

pub fn currentOrdinal(paragraphs: []const Paragraph, first: usize, template: usize) !usize {
    var found: ?usize = null;
    for (paragraphs, 0..) |paragraph, index| {
        if (!try matchesTemplate(&paragraph, template)) continue;
        if (found != null) return error.AmbiguousParagraphDisplayHost;
        found = std.math.add(usize, first, index) catch return error.LimitExceeded;
    }
    return found orelse error.MissingCurrentParagraphDisplayHost;
}

test "HWPX display source membership validates joined provenance without shell fallback" {
    const Piece = @import("paragraph_joined_values.zig").Piece;
    var pieces = [_]Piece{.{ .template_element = 7, .source_ordinal = 2, .generated_id = null, .first_site = 0, .site_count = 0 }};
    var paragraph: Paragraph = .{ .template_element = 3, .source_ordinal = 1, .sites = .{ .items = &.{} } };
    try std.testing.expect(try matchesTemplate(&paragraph, 3));
    try std.testing.expect(!try matchesTemplate(&paragraph, 7));
    paragraph.pieces = &pieces;
    try std.testing.expect(try matchesTemplate(&paragraph, 7));
    try std.testing.expect(!try matchesTemplate(&paragraph, 3));
    pieces[0].first_site = 1;
    try std.testing.expectError(error.SourceBindingMismatch, matchesTemplate(&paragraph, 7));
}
