//! query와 같은 보호 계획을 공개 전 section draft에도 적용한다.
const std = @import("std");
const model = @import("../../model/document.zig");
const plain = @import("plain_text.zig");
pub fn apply(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, section: *model.Section, edit: plain.Splice, char_count: usize) !void {
    const Context = struct {
        source: []const u8,
        version: @import("../version.zig").Version,
        original: *const model.Section,
        edit: plain.Splice,
        char_count: usize,
        fn prepare(allocator: std.mem.Allocator, draft: *model.Section, self: @This()) !void {
            var before = try @import("company_text_protection.zig").read(allocator, self.source, self.version, self.original.*);
            defer before.deinit(allocator);
            if (self.edit.paragraph >= before.protected_paragraphs.len) return error.InvalidParagraph;
            if (before.protected_paragraphs[self.edit.paragraph]) return error.ProtectedRetainedCompanyParagraph;
            try plain.applyRetainedCompanyTransaction(allocator, self.source, self.version, &draft.paragraphs[self.edit.paragraph], self.edit, self.char_count);
            var after = try @import("company_text_protection.zig").read(allocator, self.source, self.version, draft.*);
            defer after.deinit(allocator);
            if (!std.mem.eql(bool, before.protected_paragraphs, after.protected_paragraphs)) return error.SourceBindingMismatch;
            for (self.original.paragraphs, draft.paragraphs, 0..) |left, right, index| {
                if (index != self.edit.paragraph and !@import("../../model/equality.zig").paragraph(left, right)) return error.SourceBindingMismatch;
            }
        }
    };
    try @import("../../model/transaction.zig").apply(a, section, Context{ .source = source, .version = version, .original = section, .edit = edit, .char_count = char_count }, Context.prepare);
}
