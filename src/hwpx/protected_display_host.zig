//! 현재 보호 요소 소유권과 UTF-16 위치의 공통 표시 projection입니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;

pub fn currentOrdinal(paragraphs: []const Paragraph, first: usize, template: usize, anchor: usize) !usize {
    var found: ?usize = null;
    for (paragraphs, 0..) |paragraph, index| {
        if (!try @import("paragraph_display_host.zig").matchesTemplate(&paragraph, template)) continue;
        for (paragraph.protected_positions orelse return error.AmbiguousParagraphDisplayHost) |item| {
            if (item.kind != .anchor or item.element_index != anchor) continue;
            if (found != null) return error.AmbiguousParagraphDisplayHost;
            found = std.math.add(usize, first, index) catch return error.LimitExceeded;
        }
    }
    return found orelse error.MissingCurrentParagraphDisplayHost;
}

pub fn anchorPosition(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, node: usize) !usize {
    const segments = if (paragraph.protected_positions != null) try @import("paragraph_protected_positions.zig").build(a, tree, paragraph) else block: {
        const locations = try @import("paragraph_structure_locations.zig").build(a, tree, paragraph);
        defer a.free(locations);
        break :block try @import("anchor_text_positions.zig").build(a, tree, &paragraph.sites, locations, 1);
    };
    defer a.free(segments);
    for (segments) |segment| {
        if (segment.kind == .anchor and segment.index == node) return segment.start_unit;
    }
    return error.MissingProtectedDisplayAnchor;
}

test "HWPX protected display host rejects duplicate mixed and missing ownership" {
    var owned = [_]@import("paragraph_structure_values.zig").ProtectedPosition{.{ .element_index = 7, .unit = 0, .kind = .anchor }};
    const empty: @import("text_sites.zig").Sites = .{ .items = &.{} };
    var paragraphs = [_]Paragraph{
        .{ .template_element = 1, .source_ordinal = 1, .sites = empty, .protected_positions = &owned },
        .{ .template_element = 1, .source_ordinal = 1, .sites = empty, .protected_positions = &.{} },
    };
    try std.testing.expectEqual(@as(usize, 3), try currentOrdinal(&paragraphs, 3, 1, 7));
    try std.testing.expectError(error.MissingCurrentParagraphDisplayHost, currentOrdinal(&paragraphs, 3, 1, 8));
    paragraphs[1].protected_positions = &owned;
    try std.testing.expectError(error.AmbiguousParagraphDisplayHost, currentOrdinal(&paragraphs, 3, 1, 7));
    paragraphs[1].protected_positions = null;
    try std.testing.expectError(error.AmbiguousParagraphDisplayHost, currentOrdinal(&paragraphs, 3, 1, 7));
    paragraphs[0].protected_positions = &.{};
    paragraphs[1].protected_positions = &owned;
    try std.testing.expectError(error.LimitExceeded, currentOrdinal(&paragraphs, std.math.maxInt(usize), 1, 7));
}

test "HWPX protected display host resolves split joined provenance by anchor ownership" {
    const Piece = @import("paragraph_joined_values.zig").Piece;
    var pieces = [_]Piece{
        .{ .template_element = 1, .source_ordinal = 1, .generated_id = null, .first_site = 0, .site_count = 0 },
        .{ .template_element = 2, .source_ordinal = 3, .generated_id = null, .first_site = 0, .site_count = 0 },
    };
    var left = [_]@import("paragraph_structure_values.zig").ProtectedPosition{.{ .element_index = 7, .unit = 0, .kind = .anchor }};
    var right = [_]@import("paragraph_structure_values.zig").ProtectedPosition{.{ .element_index = 8, .unit = 0, .kind = .anchor }};
    const empty: @import("text_sites.zig").Sites = .{ .items = &.{} };
    var paragraphs = [_]Paragraph{
        .{ .template_element = 1, .source_ordinal = 1, .sites = empty, .pieces = &pieces, .protected_positions = &left },
        .{ .template_element = 1, .source_ordinal = null, .generated_id = 9, .sites = empty, .pieces = &pieces, .protected_positions = &right },
    };
    try std.testing.expectEqual(@as(usize, 3), try currentOrdinal(&paragraphs, 3, 1, 7));
    try std.testing.expectEqual(@as(usize, 4), try currentOrdinal(&paragraphs, 3, 2, 8));
    try std.testing.expectError(error.MissingCurrentParagraphDisplayHost, currentOrdinal(&paragraphs, 3, 2, 99));
    paragraphs[0].protected_positions = &right;
    try std.testing.expectError(error.AmbiguousParagraphDisplayHost, currentOrdinal(&paragraphs, 3, 2, 8));
    paragraphs[0].protected_positions = &left;
    pieces[1].first_site = 1;
    try std.testing.expectError(error.SourceBindingMismatch, currentOrdinal(&paragraphs, 3, 2, 8));
}
