//! Join the touching paragraphs while retaining both groups' continuations.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const Tree = @import("xml_part_tree.zig").Tree;

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, original: *const model.Values, index: usize, limit: usize) !model.Values {
    const left = try @import("column_boundary_group.zig").locate(original, index);
    if (index + 1 != left.end) return error.UnsupportedColumnBoundaryEdit;
    const right = try @import("column_boundary_group.zig").locate(original, left.end);
    if (right.end <= right.start + 1) return error.UnsupportedColumnBoundaryEdit;
    const lengths = try a.alloc(u32, right.end - right.start - 1);
    defer a.free(lengths);
    for (original.paragraphs[right.start .. right.end - 1], lengths, 0..) |*paragraph, *length, ordinal| {
        length.* = try @import("paragraph_current_units.zig").read(a, tree, paragraph);
        if (ordinal == 0) length.* = std.math.add(u32, length.*, try @import("paragraph_current_units.zig").read(a, tree, &original.paragraphs[index])) catch return error.LimitExceeded;
    }
    var current = try original.clone(a);
    errdefer current.deinit(a);
    for (0..lengths.len) |_| {
        const next = try @import("paragraph_structure_merge.zig").prepare(a, tree, &current, right.start, limit);
        current.deinit(a);
        current = next;
    }
    const joined = if (left.start == index)
        try @import("column_boundary_source_merge.zig").prepare(a, tree, &current, index, limit)
    else
        try @import("column_boundary_group_extend.zig").prepare(a, tree, &current, index, limit);
    current.deinit(a);
    current = joined;
    for (lengths, 0..) |length, ordinal| {
        const previous = &original.paragraphs[right.start + ordinal + 1];
        const id = previous.generated_id orelse return error.SourceBindingMismatch;
        const next = try @import("paragraph_structure_split.zig").prepare(a, tree, &current, index + ordinal, length, length, id, limit);
        current.deinit(a);
        current = next;
        current.paragraphs[index + ordinal + 1].paragraph_shape_id = previous.paragraph_shape_id;
        current.paragraphs[index + ordinal + 1].break_before = previous.break_before;
    }
    for (current.paragraphs[index + 1 .. right.end - 1]) |*paragraph| {
        for (paragraph.pieces orelse return error.MissingJoinedParagraph, 0..) |*piece, ordinal| {
            var right_source = piece.template_element == original.paragraphs[right.start].template_element;
            if (original.paragraphs[right.start].pieces) |sources| for (sources) |source| {
                if (piece.template_element == source.template_element) right_source = true;
            };
            if (!right_source) {
                for (paragraph.sites.items[piece.first_site..][0..piece.site_count]) |site| if (site.text.len != 0) return error.NonEmptyProvenancePiece;
                if (ordinal == 0) piece.template_only = true else piece.output = .inventory_only;
            }
        }
    }
    try @import("column_boundary_joined_group.zig").validate(a, tree, current.paragraphs[left.start .. right.end - 1]);
    _ = try current.byteSize(limit);
    return current;
}

test "column two groups merge candidate retains suffix identity and text" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/multicolumns-widths.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.mergeParagraph(0, 1));
    try std.testing.expect(try session.splitParagraph(0, 1, 1, 0));
    try std.testing.expect(try session.splitParagraph(0, 3, 0, 0));
    const original = &session.sections[0].structure_values.?;
    var candidate = try prepare(a, &session.sections[0].tree, original, 1, 1_000_000);
    defer candidate.deinit(a);
    try std.testing.expectEqual(@as(usize, 3), candidate.paragraphs.len);
    try std.testing.expectEqual(original.paragraphs[3].generated_id, candidate.paragraphs[2].generated_id);
    var before: std.ArrayList(u8) = .empty;
    defer before.deinit(a);
    var after: std.ArrayList(u8) = .empty;
    defer after.deinit(a);
    for (original.paragraphs) |paragraph| for (paragraph.sites.items) |site| try before.appendSlice(a, site.text);
    for (candidate.paragraphs) |paragraph| for (paragraph.sites.items) |site| try after.appendSlice(a, site.text);
    try std.testing.expectEqualStrings(before.items, after.items);
    const xml = try @import("column_boundary_group_xml.zig").write(a, &session.sections[0].tree, candidate.paragraphs, .{}, 1_000_000);
    defer a.free(xml);
    try std.testing.expectEqual(@as(usize, 3), std.mem.count(u8, xml, "colCount="));
}
