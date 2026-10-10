//! 같은 원본 문단에서 파생된 현재 문단들이 보호 개체를 정확히 한 번 소유하는지 검사합니다.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const Tree = @import("xml_part_tree.zig").Tree;

pub fn validate(a: std.mem.Allocator, tree: *const Tree, paragraphs: []const model.Paragraph) !void {
    if (paragraphs.len == 0) return error.SourceBindingMismatch;
    var inherited = paragraphs[0];
    inherited.protected_positions = null;
    const original = try @import("paragraph_protected_positions.zig").build(a, tree, &inherited);
    defer a.free(original);
    var expected: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer expected.deinit(a);
    for (original) |segment| if (segment.kind != .text) {
        const entry = try expected.getOrPut(a, segment.index);
        if (entry.found_existing) return error.SourceBindingMismatch;
    };
    for (paragraphs) |*paragraph| {
        if (paragraph.template_element != inherited.template_element or paragraph.protected_positions == null) return error.SourceBindingMismatch;
        const projected = try @import("paragraph_protected_positions.zig").build(a, tree, paragraph);
        defer a.free(projected);
        for (paragraph.protected_positions.?) |item| {
            if (!expected.remove(item.element_index)) return error.SourceBindingMismatch;
        }
    }
    if (expected.count() != 0) return error.SourceBindingMismatch;
}

test "HWPX protected partition rejects duplicate missing and inherited object owners" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A</p:t><p:pic/><p:t>B</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var draft = try @import("paragraph_split_text.zig").prepareAnchored(a, &tree, &sites, locations, 1, 1, 1, 1000);
    defer draft.deinit(a);
    const moves = try @import("anchor_split_plan.zig").build(a, &tree, &sites, locations, 1, 1, 1);
    defer a.free(moves);
    var owned = [_]model.ProtectedPosition{.{ .element_index = moves[0].element_index, .unit = 0, .kind = .anchor }};
    var paragraphs = [_]model.Paragraph{
        .{ .template_element = draft.paragraph_element, .source_ordinal = 1, .sites = draft.left, .protected_positions = &.{} },
        .{ .template_element = draft.paragraph_element, .source_ordinal = null, .generated_id = 2, .sites = draft.right, .protected_positions = &owned },
    };
    try validate(a, &tree, &paragraphs);
    const current: model.Values = .{ .paragraphs = &paragraphs };
    const output = try @import("paragraph_structure_save.zig").write(a, &tree, &current, .{}, &.{}, 10000);
    defer a.free(output);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, output, "<p:pic/>"));
    var reopened = try @import("xml_part_tree.zig").parse(a, output, .section, 0, 0, .{});
    defer reopened.deinit(a);
    paragraphs[1].protected_positions = &.{};
    try std.testing.expectError(error.SourceBindingMismatch, validate(a, &tree, &paragraphs));
    try std.testing.expectError(error.SourceBindingMismatch, @import("paragraph_structure_save.zig").write(a, &tree, &current, .{}, &.{}, 10000));
    paragraphs[1].protected_positions = null;
    try std.testing.expectError(error.SourceBindingMismatch, validate(a, &tree, &paragraphs));
    paragraphs[1].protected_positions = &owned;
    try std.testing.expectError(error.SourceBindingMismatch, validate(a, &tree, &.{ paragraphs[1], paragraphs[1] }));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree, rows: []const model.Paragraph) !void {
            try validate(allocator, source, rows);
            const values: model.Values = .{ .paragraphs = @constCast(rows) };
            const saved = try @import("paragraph_structure_save.zig").write(allocator, source, &values, .{}, &.{}, 10000);
            defer allocator.free(saved);
        }
    }.run, .{ &tree, &paragraphs });
    try std.testing.expectEqualStrings(xml, tree.source);
}
