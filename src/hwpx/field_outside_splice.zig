//! Prepare field-exterior text, style, and marker changes without publication.
const std = @import("std");
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Tree = @import("xml_part_tree.zig").Tree;
const Span = @import("field_current_spans.zig").Span;
pub fn prepare(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, spans: []const Span, index: usize, start: u32, deleted: u32, inserted: []const u8, limit: usize) !?Paragraph {
    if (paragraph.field_positions == null or paragraph.protected_positions != null or paragraph.column_boundaries != null) return error.UnsupportedStructuralFieldEdit;
    try @import("field_outside_range.zig").validate(spans, index, start, deleted);
    const before = try @import("field_owned_positions.zig").build(a, tree, paragraph);
    defer a.free(before);
    for (before) |segment| if (segment.kind != .text) return error.UnsupportedInlineControl;
    var candidate = try paragraph.clone(a);
    errdefer candidate.deinit(a);
    const changed = if (candidate.character_styles != null)
        try @import("character_style_splice.zig").splicePositions(a, &candidate, before, start, deleted, inserted, limit)
    else
        try @import("text_splice_transaction.zig").spliceProjected(a, &candidate.sites, before, start, deleted, inserted, limit, null);
    if (!changed) {
        candidate.deinit(a);
        return null;
    }
    const after = try @import("field_owned_positions.zig").build(a, tree, &candidate);
    defer a.free(after);
    try @import("field_position_refresh.zig").refresh(a, tree, candidate.field_positions.?, after);
    return candidate;
}

test "field exterior candidate preserves source and moves issue144 markers with allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.splitParagraph(0, 2, 0, 0));
    const source = &session.sections[0].structure_values.?.paragraphs[2];
    const trees = try a.alloc(Tree, session.sections.len);
    defer a.free(trees);
    for (session.sections, trees) |section, *tree| tree.* = section.tree;
    var report = try @import("field_markers.zig").inspect(a, trees, .{});
    defer report.deinit();
    const spans = try @import("field_current_spans.zig").build(a, trees, 0, &session.sections[0].structure_values.?, &report, 200000);
    defer a.free(spans);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, tree: *const Tree, row: *const Paragraph, ranges: []const Span) !void {
            try std.testing.expect(row.field_positions.?.len != 0);
            var edited = (try prepare(allocator, tree, row, ranges, 2, 0, 0, "한😀", 100000)) orelse return error.ExpectedChange;
            defer edited.deinit(allocator);
            try std.testing.expectEqual(row.field_positions.?.len, edited.field_positions.?.len);
            for (row.field_positions.?, edited.field_positions.?) |old, now| {
                try std.testing.expectEqual(old.element_index, now.element_index);
                try std.testing.expectEqual(old.begin_element, now.begin_element);
                try std.testing.expectEqual(old.kind, now.kind);
                try std.testing.expectEqual(old.unit + 3, now.unit);
            }
        }
    }.run, .{ &session.sections[0].tree, source, @as([]const Span, spans) });
    try std.testing.expectError(error.LimitExceeded, prepare(a, &session.sections[0].tree, source, spans, 2, 0, 0, "x", 1));
    try std.testing.expectError(error.ProtectedFieldRange, prepare(a, &session.sections[0].tree, source, spans, 2, 7, 0, "x", 100000));
    try std.testing.expectError(error.ProtectedFieldRange, prepare(a, &session.sections[0].tree, source, spans, 2, 6, 2, "x", 100000));
    try std.testing.expect((try prepare(a, &session.sections[0].tree, source, spans, 2, 0, 0, "", 100000)) == null);
    try std.testing.expectEqualSlices(u8, input, session.source);
}
