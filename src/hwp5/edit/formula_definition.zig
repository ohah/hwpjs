//! Atomic definition and dependent numeric results. No source or command cache writes.
const std = @import("std");
const model = @import("../../model/document.zig");
const Version = @import("../version.zig").Version;
pub const Edit = struct { section: usize, source_node: u32, formula: []const u8 };

const Context = struct {
    source: []const u8,
    version: Version,
    edit: Edit,
    expression: []const u8,
    char_count: usize,
    max_stream: usize,

    fn prepare(a: std.mem.Allocator, draft: *model.Section, self: @This()) !void {
        try @import("source_policy.zig").validateFieldTransaction(a, self.source, self.version);
        const bindings = try @import("field_bindings.zig").collect(a, self.source, self.version, draft.*);
        defer a.free(bindings);
        var target: ?@import("field_bindings.zig").Binding = null;
        for (bindings) |binding| if (binding.source_node == self.edit.source_node) {
            if (target != null) return error.SourceBindingMismatch;
            target = binding;
        };
        const selected = target orelse return error.InvalidFormulaField;
        if (selected.span.field_id != @import("../body/control_rules.zig").id("%fmu")) return error.InvalidFormulaField;
        if (selected.span.begin.paragraph != selected.span.end.paragraph) return error.UnsupportedFormulaParagraphs;
        const paragraph = &draft.paragraphs[selected.span.begin.paragraph];
        const original = try selected.properties.formulaView();
        const values = @import("../../model/formula_result_values.zig");
        const previous = try values.find(paragraph.formula_results orelse &.{}, selected.source_node);
        const current = if (previous) |value| value.expression orelse original.expression else original.expression;
        if (std.mem.eql(u8, current, self.expression)) return;
        paragraph.formula_results = try values.upsert(a, paragraph.formula_results, .{
            .source_node = selected.source_node,
            .value = if (previous) |value| value.value else 0,
            .grouping = if (previous) |value| value.grouping else .none,
            .modified = true,
            .expression = if (std.mem.eql(u8, self.expression, original.expression)) null else @constCast(self.expression),
        });
        _ = try @import("formula_recalculate.zig").applyDraft(a, self.source, self.version, draft, self.char_count, .{});
        const candidate = try @import("text_section_writer.zig").write(a, self.source, draft.*, self.version, self.max_stream);
        defer a.free(candidate);
    }
};

pub fn apply(a: std.mem.Allocator, source: []const u8, version: Version, section: *model.Section, edit: Edit, char_count: usize, max_stream: usize) !void {
    const limit = @import("formula_definition_command.zig").max_expression_bytes;
    if (edit.formula.len > limit) return error.LimitExceeded;
    if (edit.formula.len < 2 or edit.formula[0] != '=') return error.UnsupportedFormulaExpression;
    const units = try std.unicode.utf8ToUtf16LeAlloc(a, edit.formula[1..]);
    defer a.free(units);
    const expression = std.mem.sliceAsBytes(units);
    if (expression.len > limit) return error.LimitExceeded;
    _ = try @import("../body/formula_range.zig").Range.parse(expression);
    const context: Context = .{ .source = source, .version = version, .edit = edit, .expression = expression, .char_count = char_count, .max_stream = max_stream };
    try @import("../../model/transaction.zig").apply(a, section, context, Context.prepare);
}
