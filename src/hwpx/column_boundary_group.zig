//! One original paragraph and its contiguous current continuations.
const model = @import("paragraph_structure_values.zig");
pub const Range = struct { start: usize, end: usize };

pub fn locate(current: *const model.Values, index: usize) !Range {
    if (index >= current.paragraphs.len) return error.InvalidParagraphIndex;
    var first = index;
    while (first > 0 and current.paragraphs[first].source_ordinal == null) : (first -= 1) {}
    const original = current.paragraphs[first];
    if (original.source_ordinal == null or original.generated_id != null) return error.SourceBindingMismatch;
    var end = first + 1;
    while (end < current.paragraphs.len and current.paragraphs[end].source_ordinal == null) : (end += 1) {
        const continuation = current.paragraphs[end];
        if (continuation.generated_id == null or continuation.template_element != original.template_element) return error.SourceBindingMismatch;
    }
    return .{ .start = first, .end = end };
}

test "column boundary group validates continuation identities without source inference" {
    const std = @import("std");
    var paragraphs = [_]model.Paragraph{
        .{ .template_element = 10, .source_ordinal = 8, .sites = .{ .items = &.{} } },
        .{ .template_element = 10, .source_ordinal = null, .generated_id = 7, .sites = .{ .items = &.{} } },
        .{ .template_element = 25, .source_ordinal = 9, .sites = .{ .items = &.{} } },
    };
    const current: model.Values = .{ .paragraphs = &paragraphs };
    try std.testing.expectEqual(Range{ .start = 0, .end = 2 }, try locate(&current, 1));
    try std.testing.expectEqual(Range{ .start = 2, .end = 3 }, try locate(&current, 2));
    paragraphs[1].template_element = 11;
    try std.testing.expectError(error.SourceBindingMismatch, locate(&current, 1));
    paragraphs[1].template_element = 10;
    paragraphs[1].generated_id = null;
    try std.testing.expectError(error.SourceBindingMismatch, locate(&current, 1));
    paragraphs[1].generated_id = 7;
    paragraphs[0].generated_id = 4;
    try std.testing.expectError(error.SourceBindingMismatch, locate(&current, 1));
    try std.testing.expectError(error.InvalidParagraphIndex, locate(&current, 3));
}
