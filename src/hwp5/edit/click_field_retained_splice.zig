//! Private-draft splice only. field_splice owns the atomic commit boundary.
const std = @import("std");
const model = @import("../../model/document.zig");
const plain = @import("plain_text.zig");

pub fn prepare(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, original: model.Section, draft: *model.Section, edit: plain.Splice, char_count: usize) !void {
    var before = try @import("click_field_retention.zig").read(a, source, version, original);
    defer before.deinit(a);
    if (edit.paragraph >= before.protected_paragraphs.len) return error.InvalidParagraph;
    if (before.protected_paragraphs[edit.paragraph]) return error.UnsupportedCrossParagraphField;
    try plain.applyFieldTransaction(a, source, version, &draft.paragraphs[edit.paragraph], edit, char_count);
    var after = try @import("click_field_retention.zig").read(a, source, version, draft.*);
    defer after.deinit(a);
    if (before.bound_headers != after.bound_headers or !std.mem.eql(bool, before.protected_paragraphs, after.protected_paragraphs)) return error.SourceBindingMismatch;
    for (original.paragraphs, draft.paragraphs, 0..) |left, right, index| {
        if (index != edit.paragraph and !@import("../../model/equality.zig").paragraph(left, right)) return error.SourceBindingMismatch;
    }
}
