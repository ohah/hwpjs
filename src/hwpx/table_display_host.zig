//! Map source host provenance to current structural paragraph ordinals.
const std = @import("std");
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;

pub fn anchorUnit(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, paragraph: *const Paragraph, table: usize) !usize {
    if (@import("run_anchor.zig").kind(tree, table) != .table) return error.InvalidTableDisplayAnchor;
    return @import("protected_display_host.zig").anchorPosition(a, tree, paragraph, table) catch |err| switch (err) {
        error.MissingProtectedDisplayAnchor => error.MissingTableDisplayAnchor,
        else => err,
    };
}

pub fn currentOrdinal(paragraphs: []const Paragraph, first: usize, template: usize) !usize {
    return @import("paragraph_display_host.zig").currentOrdinal(paragraphs, first, template) catch |err| switch (err) {
        error.AmbiguousParagraphDisplayHost => error.AmbiguousTableDisplayHost,
        error.MissingCurrentParagraphDisplayHost => error.MissingCurrentTableDisplayHost,
        else => err,
    };
}

/// 표 앵커가 알려진 경로는 반복된 원본 출처가 아니라 현재 소유권으로 선택합니다.
pub fn currentOrdinalWithAnchor(paragraphs: []const Paragraph, first: usize, template: usize, anchor: usize) !usize {
    for (paragraphs) |paragraph| {
        if (paragraph.protected_positions == null or !try @import("paragraph_display_host.zig").matchesTemplate(&paragraph, template)) continue;
        return @import("protected_display_host.zig").currentOrdinal(paragraphs, first, template, anchor) catch |err| switch (err) {
            error.AmbiguousParagraphDisplayHost => error.AmbiguousTableDisplayHost,
            error.MissingCurrentParagraphDisplayHost => error.MissingCurrentTableDisplayHost,
            else => err,
        };
    }
    return currentOrdinal(paragraphs, first, template);
}

test "HWPX split table host selects exact protected owner instead of duplicate provenance" {
    var pieces = [_]@import("paragraph_joined_values.zig").Piece{.{ .template_element = 2, .source_ordinal = 1, .generated_id = null, .first_site = 0, .site_count = 0 }};
    var left = [_]@import("paragraph_structure_values.zig").ProtectedPosition{.{ .element_index = 7, .unit = 0, .kind = .anchor }};
    var right = [_]@import("paragraph_structure_values.zig").ProtectedPosition{.{ .element_index = 8, .unit = 0, .kind = .anchor }};
    var paragraphs = [_]Paragraph{
        .{ .template_element = 2, .source_ordinal = 1, .sites = .{ .items = &.{} }, .pieces = &pieces, .protected_positions = &left },
        .{ .template_element = 2, .source_ordinal = null, .generated_id = 9, .sites = .{ .items = &.{} }, .pieces = &pieces, .protected_positions = &right },
    };
    try std.testing.expectError(error.AmbiguousTableDisplayHost, currentOrdinal(&paragraphs, 3, 2));
    try std.testing.expectEqual(@as(usize, 3), try currentOrdinalWithAnchor(&paragraphs, 3, 2, 7));
    try std.testing.expectEqual(@as(usize, 4), try currentOrdinalWithAnchor(&paragraphs, 3, 2, 8));
    try std.testing.expectError(error.MissingCurrentTableDisplayHost, currentOrdinalWithAnchor(&paragraphs, 3, 2, 99));
    paragraphs[0].protected_positions = &right;
    try std.testing.expectError(error.AmbiguousTableDisplayHost, currentOrdinalWithAnchor(&paragraphs, 3, 2, 8));
}

test "HWPX current table host handles shifted joined and ambiguous template provenance" {
    const empty: @import("text_sites.zig").Sites = .{ .items = &.{} };
    var paragraphs = [_]Paragraph{
        .{ .template_element = 4, .source_ordinal = 1, .sites = empty },
        .{ .template_element = 8, .source_ordinal = 2, .sites = empty },
    };
    try std.testing.expectEqual(@as(usize, 11), try currentOrdinal(&paragraphs, 10, 8));
    try std.testing.expectError(error.MissingCurrentTableDisplayHost, currentOrdinal(&paragraphs, 10, 99));
    try std.testing.expectError(error.LimitExceeded, currentOrdinal(&paragraphs, std.math.maxInt(usize), 8));
    paragraphs[0].template_element = 8;
    try std.testing.expectError(error.AmbiguousTableDisplayHost, currentOrdinal(&paragraphs, 10, 8));
    paragraphs[0].template_element = 4;
    var pieces = [_]@import("paragraph_joined_values.zig").Piece{
        .{ .template_element = 8, .source_ordinal = 2, .generated_id = null, .first_site = 0, .site_count = 0 },
        .{ .template_element = 12, .source_ordinal = 3, .generated_id = null, .first_site = 0, .site_count = 0 },
    };
    paragraphs[1].pieces = &pieces;
    try std.testing.expectEqual(@as(usize, 11), try currentOrdinal(&paragraphs, 10, 12));
    pieces[1].first_site = 1;
    try std.testing.expectError(error.SourceBindingMismatch, currentOrdinal(&paragraphs, 10, 12));
}

test "HWPX table anchor unit distinguishes preceding rectangle in actual mixed host" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/multicolumns-layout.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const section = &session.sections[0];
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    var count: usize = 0;
    for (section.tree.elements, 0..) |element, node| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "tbl")) continue;
        const template = section.tree.elements[element.parent.?].parent.?;
        const ordinal = try currentOrdinal(current.paragraphs, section.first_paragraph, template);
        const paragraph = &current.paragraphs[ordinal - section.first_paragraph];
        try std.testing.expectEqual(@as(usize, 10), ordinal);
        try std.testing.expectEqual(@as(usize, 1), try anchorUnit(a, &section.tree, paragraph, node));
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, value: *const Paragraph, index: usize) !void {
                try std.testing.expectEqual(@as(usize, 1), try anchorUnit(allocator, tree, value, index));
            }
        }.run, .{ &section.tree, paragraph, node });
        try std.testing.expectError(error.InvalidTableDisplayAnchor, anchorUnit(a, &section.tree, paragraph, template));
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 1), count);
}

test "HWPX table anchor unit follows current UTF16 text rather than source byte offsets" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A😀</p:t><p:rect/><p:tbl/><p:t>끝</p:t></p:run></p:p></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    var paragraph: Paragraph = .{ .template_element = 1, .source_ordinal = 1, .sites = try @import("text_sites.zig").collect(a, &tree, .{}) };
    defer paragraph.deinit(a);
    var table: ?usize = null;
    for (tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "tbl")) table = index;
    }
    try std.testing.expectEqual(@as(usize, 4), try anchorUnit(a, &tree, &paragraph, table.?));
    _ = try @import("text_site_edit.zig").splice(a, &paragraph.sites, 0, 0, 0, "앞😀", 1000);
    try std.testing.expectEqual(@as(usize, 7), try anchorUnit(a, &tree, &paragraph, table.?));
}
