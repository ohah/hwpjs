//! Validate column ownership across a joined original and its continuations.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;

pub fn validate(a: std.mem.Allocator, tree: *const Tree, paragraphs: []const Paragraph) !void {
    return validateMode(a, tree, paragraphs, false, false);
}

pub fn validateWithTabs(a: std.mem.Allocator, tree: *const Tree, paragraphs: []const Paragraph) !void {
    try @import("paragraph_joined_tab_group.zig").validate(a, tree, paragraphs);
    return validateMode(a, tree, paragraphs, true, false);
}

pub fn validateWithAnchors(a: std.mem.Allocator, tree: *const Tree, paragraphs: []const Paragraph) !void {
    try @import("paragraph_joined_tab_group.zig").validateWithAnchors(a, tree, paragraphs);
    return validateMode(a, tree, paragraphs, true, true);
}

fn validateMode(a: std.mem.Allocator, tree: *const Tree, paragraphs: []const Paragraph, allow_tabs: bool, anchors: bool) !void {
    if (paragraphs.len == 0) return error.SourceBindingMismatch;
    const first = &paragraphs[0];
    const original = first.joined() orelse return error.SourceBindingMismatch;
    if (first.generated_id != null or first.source_ordinal == null) return error.SourceBindingMismatch;
    try @import("column_boundary_joined_provenance.zig").validate(tree, &original);
    const inventory = if (anchors) try @import("column_boundary_joined_collect.zig").collectWithAnchors(a, tree, &original, tree.elements.len) else if (allow_tabs) try @import("column_boundary_joined_collect.zig").collectWithTabs(a, tree, &original, tree.elements.len) else try @import("column_boundary_joined_collect.zig").collect(a, tree, &original, tree.elements.len);
    defer a.free(inventory);
    var cursor: usize = 0;
    for (paragraphs, 0..) |*paragraph, ordinal| {
        const joined = paragraph.joined() orelse return error.SourceBindingMismatch;
        const owned = paragraph.column_boundaries orelse return error.SourceBindingMismatch;
        if (paragraph.template_element != first.template_element) return error.SourceBindingMismatch;
        if (ordinal != 0) {
            if (paragraph.generated_id == null or paragraph.source_ordinal != null) return error.SourceBindingMismatch;
            try @import("column_boundary_joined_provenance.zig").validateContinuation(&original, &joined, paragraph.generated_id.?);
        }
        const positions = if (anchors) try @import("paragraph_joined_positions.zig").buildOwnedAnchors(a, tree, &joined, paragraph.protected_positions orelse return error.SourceBindingMismatch) else if (allow_tabs) try @import("paragraph_joined_positions.zig").buildOwnedTabs(a, tree, &joined, paragraph.protected_positions orelse return error.SourceBindingMismatch) else try @import("paragraph_joined_positions.zig").build(a, tree, &joined);
        defer a.free(positions);
        for (owned, 0..) |boundary, index| {
            if (cursor >= inventory.len or boundary.source_element != inventory[cursor].source_element) return error.SourceBindingMismatch;
            if (index != 0 and boundary.unit < owned[index - 1].unit) return error.InvalidColumnBoundaryOrder;
            try @import("paragraph_text_positions.zig").validateBoundary(&paragraph.sites, positions, boundary.unit);
            cursor += 1;
        }
    }
    if (cursor != inventory.len) return error.SourceBindingMismatch;
}

test "HWPX column anchor group validates actual joined table ownership with allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/borderfill.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.mergeParagraphPair(0, 1, 5));
    const section = &session.sections[0];
    const paragraphs = section.structure_values.?.paragraphs[0..1];
    try validateWithAnchors(a, &section.tree, paragraphs);
    try std.testing.expectError(error.UnsupportedParagraphControl, validateWithTabs(a, &section.tree, paragraphs));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, tree: *const Tree, values: []const Paragraph) !void {
            try validateWithAnchors(allocator, tree, values);
        }
    }.run, .{ &section.tree, paragraphs });
    try std.testing.expectEqualSlices(u8, input, session.source);
}
