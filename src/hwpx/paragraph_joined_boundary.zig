//! Source adjacency or a proven repeated continuation template, never flattening.
const std = @import("std");
const Joined = @import("paragraph_joined_values.zig").Joined;

pub fn validate(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const Joined, index: usize) !void {
    return validateMode(a, tree, current, index, false, false, false);
}

pub fn validateWithTabs(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const Joined, index: usize) !void {
    return validateMode(a, tree, current, index, true, false, false);
}

pub fn validateWithAnchors(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const Joined, index: usize) !void {
    return validateMode(a, tree, current, index, true, true, false);
}

pub fn validateWithColumnPageAreas(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const Joined, index: usize) !void {
    return validateMode(a, tree, current, index, false, false, true);
}

fn validateMode(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const Joined, index: usize, allow_tabs: bool, anchors: bool, page_areas: bool) !void {
    if (index == 0 or index >= current.pieces.len) return error.InvalidParagraphIndex;
    const left = try current.paragraph(index - 1);
    const right = try current.paragraph(index);
    const checked = if (page_areas) @import("paragraph_merge_policy.zig").validateWithColumnPageAreas(a, tree, &left, &right) else if (anchors) @import("paragraph_merge_policy.zig").validateWithAnchors(a, tree, &left, &right) else if (allow_tabs) @import("paragraph_merge_policy.zig").validateWithTabs(a, tree, &left, &right) else @import("paragraph_merge_policy.zig").validate(a, tree, &left, &right);
    checked catch |err| {
        if (err != error.InvalidParagraphAdjacency) return err;
        const piece = current.pieces[index];
        if (piece.owns_source or piece.source_ordinal != null or piece.generated_id == null or piece.generated_id.? == 0) return err;
        // The normal policy already established the same XML parent and plain
        // permission. Prove reuse of an earlier full binding, not just an ID.
        for (0..index) |previous| {
            const original = try current.paragraph(previous);
            if (original.template_element != right.template_element or original.sites.items.len != right.sites.items.len) continue;
            var same = true;
            for (original.sites.items, right.sites.items) |one, two| {
                if (one.element_index != two.element_index or one.start != two.start or one.end != two.end or one.empty_element != two.empty_element or one.missing_text != two.missing_text or one.anchor_boundary != two.anchor_boundary) same = false;
            }
            if (same) return;
        }
        return err;
    };
}

test "HWPX joined continuation boundary rejects unproven source ownership" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p id='9'><p:run><p:t>AB</p:t></p:run></p:p><p:p id='10'><p:run><p:t>CD</p:t></p:run></p:p>");
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.mergeParagraph(0, 1));
    try std.testing.expect(try session.splitParagraph(0, 1, 1, 0));
    const values = session.sections[0].structure_values.?;
    // Keep a genuine retained seam: aligned untouched halves now fold back
    // into their source pieces, so they cannot exercise boundary validation.
    // Text in the later left run precedes the earlier right run and must not
    // be folded, otherwise current text order would change.
    _ = try @import("text_site_edit.zig").splice(a, &session.sections[0].structure_values.?.paragraphs[0].sites, 1, 0, 0, "L", 10000);
    const left = values.paragraphs[0].joined().?;
    const right = values.paragraphs[1].joined().?;
    var output = try @import("paragraph_joined_merge.zig").prepare(a, &session.sections[0].tree, &left, &right, 10000);
    defer output.deinit(a);
    try validate(a, &session.sections[0].tree, &output, left.pieces.len);
    output.pieces[left.pieces.len].owns_source = true;
    try std.testing.expectError(error.InvalidParagraphAdjacency, validate(a, &session.sections[0].tree, &output, left.pieces.len));
    output.pieces[left.pieces.len].owns_source = false;
    output.pieces[left.pieces.len].generated_id = null;
    try std.testing.expectError(error.InvalidParagraphAdjacency, validate(a, &session.sections[0].tree, &output, left.pieces.len));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, one: *const Joined, two: *const Joined) !void {
            var merged = try @import("paragraph_joined_merge.zig").prepare(allocator, tree, one, two, 10000);
            defer merged.deinit(allocator);
        }
    }.run, .{ &session.sections[0].tree, &left, &right });
}
