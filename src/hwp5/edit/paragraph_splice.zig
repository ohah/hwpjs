//! One dispatch policy for normal and generated-object host transactions.
const std = @import("std");
pub fn apply(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, section: *@import("../../model/document.zig").Section, edit: @import("plain_text.zig").Splice, char_count: usize) !void {
    if (edit.paragraph >= section.paragraphs.len) return error.InvalidParagraph;
    if (try @import("company_source.zig").has(source)) return @import("company_splice.zig").apply(a, source, version, section, edit, char_count);
    const paragraph = &section.paragraphs[edit.paragraph];
    const retained_node = paragraph.source_node orelse paragraph.header_template;
    if (retained_node != null and
        try @import("memo_body_retention.zig").target(a, source, version, retained_node.?))
    {
        try @import("formula_structure_scope.zig").validate(a, source, version, paragraph.*);
        return @import("plain_text.zig").apply(a, source, version, paragraph, edit, char_count);
    }
    if (paragraph.parent_node != null) {
        const node = paragraph.source_node orelse paragraph.header_template orelse return error.MissingParagraphTemplate;
        var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, source, version, .{});
        defer tree.deinit(a);
        if (node >= tree.nodes.len) return error.SourceBindingMismatch;
        if (try @import("memo_source_retention.zig").target(a, tree, node, version)) {
            // Memo lists are not table formula input cells. Keep the existing
            // dependency guard, then edit only this owned paragraph.
            try @import("formula_structure_scope.zig").validate(a, source, version, paragraph.*);
            return @import("plain_text.zig").apply(a, source, version, paragraph, edit, char_count);
        }
    }
    if (try @import("source_policy.zig").hasNamedFields(source)) {
        try @import("field_splice.zig").apply(a, source, version, section, edit, char_count);
    } else if (try @import("source_policy.zig").hasFormulas(a, source, version)) {
        try @import("formula_splice.zig").apply(a, source, version, section, edit, char_count);
    } else if (try @import("hyperlink_splice.zig").hasCrossParagraph(a, section.*)) {
        try @import("hyperlink_splice.zig").apply(a, source, version, section, edit, char_count);
    } else try @import("plain_text.zig").apply(a, source, version, &section.paragraphs[edit.paragraph], edit, char_count);
}
