//! Protect derived formula and cross-reference labels using shared logical ownership.
const std = @import("std");
const model = @import("../../model/document.zig");
pub fn isDerivedResult(id: u32) bool {
    const rules = @import("../body/control_rules.zig");
    return id == rules.id("%fmu") or id == rules.id("%xrf") or id == rules.id("%sig");
}
pub fn validate(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, section: model.Section, bindings: []const @import("field_bindings.zig").Binding, edit: @import("plain_text.zig").Splice) !bool {
    if (edit.paragraph >= section.paragraphs.len) return error.InvalidParagraph;
    if (edit.start_unit > edit.end_unit) return error.InvalidTextRange;
    var formulas = false;
    var results = false;
    const rules = @import("../body/control_rules.zig");
    for (bindings) |binding| {
        formulas = formulas or binding.span.field_id == rules.id("%fmu");
        results = results or isDerivedResult(binding.span.field_id);
    }
    if (!results) return false;
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, source, version, .{});
    defer tree.deinit(a);
    const ownership = @import("paragraph_owner.zig");
    var groups = try ownership.inspectGroups(a, tree, version);
    defer groups.deinit(a);
    const target = try ownership.logicalOwner(tree, groups, try section.paragraphs[edit.paragraph].originalNode());
    for (bindings) |binding| {
        const span = binding.span;
        if (!isDerivedResult(span.field_id)) continue;
        const owner = try ownership.logicalOwner(tree, groups, try section.paragraphs[span.begin.paragraph].originalNode());
        if (target != owner or edit.paragraph < span.begin.paragraph or edit.paragraph > span.end.paragraph) continue;
        const begin = if (edit.paragraph == span.begin.paragraph) span.begin.unit else 0;
        const end = if (edit.paragraph == span.end.paragraph) span.end.unit else std.math.maxInt(u32);
        const overlap = if (edit.start_unit == edit.end_unit) edit.start_unit >= begin and edit.start_unit <= end else edit.start_unit < end and edit.end_unit > begin;
        if (overlap) return if (span.field_id == rules.id("%xrf")) error.ReadOnlyCrossReferenceResult else if (span.field_id == rules.id("%sig")) error.ReadOnlyRetainedFieldResult else error.ReadOnlyFormulaResult;
    }
    return formulas;
}
