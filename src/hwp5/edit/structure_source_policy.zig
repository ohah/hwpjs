//! Preserve validated immutable fields only outside the structural target.
const std = @import("std");
const Version = @import("../version.zig").Version;
const model = @import("../../model/document.zig");
const Tree = @import("../body/tree.zig").Tree;

pub fn inspect(a: std.mem.Allocator, source: []const u8, version: Version) !bool {
    return @import("source_policy.zig").hasFormulas(a, source, version) catch |err| switch (err) {
        error.UnsupportedSectionControl, error.UnsupportedSectionStructure => {
            // Existing immutable topology validation, not generic unknown retention.
            try @import("source_policy.zig").validateUnselectedSection(a, source, version);
            return false;
        },
        else => return err,
    };
}

pub fn validateParagraph(a: std.mem.Allocator, source: []const u8, version: Version, paragraph: model.Paragraph, tree: Tree) !void {
    _ = try inspect(a, source, version);
    if (!try @import("source_policy.zig").hasNamedFields(source)) return;
    const node = paragraph.source_node orelse paragraph.header_template orelse return error.MissingParagraphTemplate;
    // Owned memo bodies have their own checked envelope, not field-result text.
    if (try @import("memo_source_retention.zig").target(a, tree, node, version)) return;
    var original = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{source});
    defer original.deinit(a);
    const spans = try @import("local_field_spans.zig").collectReadableBound(a, source, version, original.sections[0]);
    defer a.free(spans);
    for (original.sections[0].paragraphs, 0..) |candidate, index| {
        if (candidate.source_node != node) continue;
        for (spans) |span| if (index >= span.begin.paragraph and index <= span.end.paragraph) return error.UnsupportedStructuralControl;
        return;
    }
    return error.SourceBindingMismatch;
}
