//! Single ownership of column controls in one original paragraph's descendants.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;

pub fn validate(a: std.mem.Allocator, tree: *const Tree, paragraphs: []const Paragraph) !void {
    if (paragraphs.len == 0) return error.SourceBindingMismatch;
    const owner = paragraphs[0].template_element;
    // Reuse source selection; coordinates here are unused identity placeholders.
    const original = try @import("column_boundary_collect.zig").collect(a, tree, owner, &.{}, .left, tree.elements.len);
    defer a.free(original);
    var expected: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer expected.deinit(a);
    for (original, 0..) |boundary, index| {
        const entry = try expected.getOrPut(a, boundary.source_element);
        if (entry.found_existing) return error.SourceBindingMismatch;
        entry.value_ptr.* = index;
    }
    var previous_source: ?usize = null;
    for (paragraphs) |*paragraph| {
        if (paragraph.template_element != owner or paragraph.column_boundaries == null or paragraph.pieces != null) return error.SourceBindingMismatch;
        const positions = try @import("paragraph_protected_positions.zig").build(a, tree, paragraph);
        defer a.free(positions);
        for (paragraph.column_boundaries.?, 0..) |boundary, index| {
            if (index != 0 and boundary.unit < paragraph.column_boundaries.?[index - 1].unit) return error.InvalidColumnBoundaryOrder;
            try @import("paragraph_text_positions.zig").validateBoundary(&paragraph.sites, positions, boundary.unit);
            const source_order = expected.get(boundary.source_element) orelse return error.SourceBindingMismatch;
            if (previous_source) |previous| if (source_order <= previous) return error.InvalidColumnBoundaryOrder;
            previous_source = source_order;
            if (!expected.remove(boundary.source_element)) return error.SourceBindingMismatch;
        }
    }
    if (expected.count() != 0) return error.SourceBindingMismatch;
}

test "column boundary partition refuses duplicate missing inherited and out of range owners" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:colPr colCount='1'/></p:ctrl><p:t>AB</p:t><p:ctrl><p:colPr colCount='2'/></p:ctrl><p:t>😀</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var draft = try @import("paragraph_split_text.zig").prepare(a, &tree, &sites, locations, 1, 2, 2, 10000);
    defer draft.deinit(a);
    const sources = try @import("column_boundary_collect.zig").collect(a, &tree, draft.paragraph_element, &.{}, .right, 2);
    defer a.free(sources);
    var left = [_]@import("column_boundary_position.zig").Position{sources[0]};
    var right = [_]@import("column_boundary_position.zig").Position{sources[1]};
    var paragraphs = [_]Paragraph{
        .{ .template_element = draft.paragraph_element, .source_ordinal = 1, .sites = draft.left, .column_boundaries = &left },
        .{ .template_element = draft.paragraph_element, .source_ordinal = null, .generated_id = 2, .sites = draft.right, .column_boundaries = &right },
    };
    try validate(a, &tree, &paragraphs);
    std.mem.swap(usize, &left[0].source_element, &right[0].source_element);
    try std.testing.expectError(error.InvalidColumnBoundaryOrder, validate(a, &tree, &paragraphs));
    std.mem.swap(usize, &left[0].source_element, &right[0].source_element);
    paragraphs[1].column_boundaries = &.{};
    try std.testing.expectError(error.SourceBindingMismatch, validate(a, &tree, &paragraphs));
    paragraphs[1].column_boundaries = null;
    try std.testing.expectError(error.SourceBindingMismatch, validate(a, &tree, &paragraphs));
    paragraphs[1].column_boundaries = &right;
    right[0].source_element = left[0].source_element;
    try std.testing.expectError(error.SourceBindingMismatch, validate(a, &tree, &paragraphs));
    right[0] = sources[1];
    right[0].unit = 3;
    try std.testing.expectError(error.InvalidTextPosition, validate(a, &tree, &paragraphs));
    right[0] = sources[1];
    right[0].unit = 1;
    try std.testing.expectError(error.SplitSurrogatePair, validate(a, &tree, &paragraphs));
    right[0] = sources[1];
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree, current: []const Paragraph) !void {
            try validate(allocator, source, current);
        }
    }.run, .{ &tree, &paragraphs });
    try std.testing.expectEqualStrings(xml, tree.source);
}
