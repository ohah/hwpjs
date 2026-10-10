//! Current output identity, distinct from XML id and reusable template indices.
const std = @import("std");
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
pub const Reference = union(enum) { source_ordinal: usize, generated_id: u32 };

pub fn from(paragraph: *const Paragraph) !Reference {
    if (paragraph.generated_id) |id| {
        if (id == 0 or paragraph.source_ordinal != null) return error.InvalidCurrentParagraphReference;
        return .{ .generated_id = id };
    }
    const source = paragraph.source_ordinal orelse return error.InvalidCurrentParagraphReference;
    if (source == 0) return error.InvalidCurrentParagraphReference;
    return .{ .source_ordinal = source };
}

pub fn index(paragraphs: []const Paragraph, reference: Reference) !usize {
    switch (reference) {
        .source_ordinal => |value| if (value == 0) return error.InvalidCurrentParagraphReference,
        .generated_id => |value| if (value == 0) return error.InvalidCurrentParagraphReference,
    }
    var found: ?usize = null;
    for (paragraphs, 0..) |*paragraph, position| {
        if (!std.meta.eql(try from(paragraph), reference)) continue;
        if (found != null) return error.AmbiguousCurrentParagraphReference;
        found = position;
    }
    return found orelse error.MissingCurrentParagraphReference;
}

pub fn ordinal(paragraphs: []const Paragraph, first: usize, reference: Reference) !usize {
    if (first == 0) return error.InvalidCurrentParagraphReference;
    return std.math.add(usize, first, try index(paragraphs, reference)) catch error.LimitExceeded;
}

test "current paragraph reference separates source and generated namespaces and rejects stale ambiguity" {
    var rows = [_]Paragraph{
        .{ .template_element = 10, .source_ordinal = 1, .sites = .{ .items = &.{} } },
        .{ .template_element = 10, .source_ordinal = null, .generated_id = 1, .sites = .{ .items = &.{} } },
    };
    try std.testing.expectEqual(@as(usize, 0), try index(&rows, .{ .source_ordinal = 1 }));
    try std.testing.expectEqual(@as(usize, 1), try index(&rows, .{ .generated_id = 1 }));
    try std.testing.expectEqual(@as(usize, 9), try ordinal(&rows, 8, .{ .generated_id = 1 }));
    try std.testing.expectError(error.LimitExceeded, ordinal(&rows, std.math.maxInt(usize), .{ .generated_id = 1 }));
    try std.testing.expectError(error.InvalidCurrentParagraphReference, index(&rows, .{ .generated_id = 0 }));
    try std.testing.expectError(error.MissingCurrentParagraphReference, index(&rows, .{ .source_ordinal = 9 }));
    rows[1] = rows[0];
    try std.testing.expectError(error.AmbiguousCurrentParagraphReference, index(&rows, .{ .source_ordinal = 1 }));
    rows[1].generated_id = 3;
    try std.testing.expectError(error.InvalidCurrentParagraphReference, from(&rows[1]));
}
