//! Atomic ordinary-text splice plus all supported local formula recalculations.
const std = @import("std");
const model = @import("../../model/document.zig");
const plain = @import("plain_text.zig");
const Version = @import("../version.zig").Version;
const Context = struct {
    source: []const u8,
    version: Version,
    edit: plain.Splice,
    char_count: usize,

    fn prepare(a: std.mem.Allocator, draft: *model.Section, self: @This()) !void {
        if (self.edit.paragraph >= draft.paragraphs.len) return error.InvalidParagraph;
        const p = &draft.paragraphs[self.edit.paragraph];
        const before = try plain.textBytes(a, p.*);
        defer a.free(before);
        try plain.applyFormulaTransaction(a, self.source, self.version, p, self.edit, self.char_count);
        const after = try plain.textBytes(a, p.*);
        defer a.free(after);
        if (std.mem.eql(u8, before, after)) return;
        _ = try @import("formula_recalculate.zig").applyDraft(a, self.source, self.version, draft, self.char_count, .{});
    }
};

pub fn apply(a: std.mem.Allocator, source: []const u8, version: Version, section: *model.Section, edit: plain.Splice, char_count: usize) !void {
    try @import("../../model/transaction.zig").apply(a, section, Context{ .source = source, .version = version, .edit = edit, .char_count = char_count }, Context.prepare);
}
