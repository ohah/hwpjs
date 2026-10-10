//! Formula preparation; shared derived display owns model installation.
const std = @import("std");
const model = @import("../../model/document.zig");
pub fn applyDraft(a: std.mem.Allocator, p: *model.Paragraph, properties: @import("../body/field_start.zig").Properties, result: model.FormulaResult, ordinal: usize, source_ranges: ?@import("../body/reader.zig").Ranges, char_count: usize) !void {
    const before = try @import("plain_text_content.zig").textBytes(a, p.*);
    defer a.free(before);
    if (before.len / 2 != p.declared_units) return error.SourceBindingMismatch;
    var display = try @import("formula_display_writer.zig").prepare(a, before, properties, result, ordinal);
    defer display.deinit(a);
    try @import("derived_display_apply.zig").applyDraft(a, p, before, display.bytes, .{ .start_unit = display.start_unit, .end_unit = display.end_unit, .added_units = display.added_units }, source_ranges, char_count);
}
