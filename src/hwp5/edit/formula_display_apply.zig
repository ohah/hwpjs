//! Internal derived-label materialization into a transaction-owned paragraph.
//! Caller must validate source ownership/resources and the original range view.
const std = @import("std");
const model = @import("../../model/document.zig");
const body = @import("../body/reader.zig");

pub fn applyDraft(a: std.mem.Allocator, p: *model.Paragraph, properties: @import("../body/field_start.zig").Properties, result: model.FormulaResult, ordinal: usize, source_ranges: ?body.Ranges, char_count: usize) !void {
    const before = try @import("plain_text_content.zig").textBytes(a, p.*);
    defer a.free(before);
    if (before.len / 2 != p.declared_units) return error.SourceBindingMismatch;
    var display = try @import("formula_display_writer.zig").prepare(a, before, properties, result, ordinal);
    defer display.deinit(a);
    if (std.mem.eql(u8, before, display.bytes)) return;
    const runs = @import("character_runs.zig");
    try runs.validate(p.character_runs, before, char_count);
    const owned_runs = try runs.replace(a, p.character_runs, display.start_unit, display.end_unit, display.added_units, null);
    errdefer a.free(owned_runs);
    const owned_ranges = try @import("text_ranges.zig").prepare(a, p.range_tags, source_ranges, before, display.start_unit, display.end_unit, display.added_units);
    errdefer a.free(owned_ranges);
    var tokens: std.ArrayList(model.Token) = .empty;
    errdefer {
        for (tokens.items) |token| a.free(token.raw);
        tokens.deinit(a);
    }
    var it = (try body.Text.parse(display.bytes)).tokens();
    while (try it.next()) |token| {
        const raw = try a.dupe(u8, token.raw);
        errdefer a.free(raw);
        try tokens.append(a, .{ .start_unit = @intCast(token.start_unit), .kind = if (token.value == .text) .text else .control, .encoding = .utf16le, .raw = raw });
    }
    const owned_tokens = try tokens.toOwnedSlice(a);
    for (p.tokens) |token| a.free(token.raw);
    a.free(p.tokens);
    a.free(p.character_runs);
    if (p.range_tags) |ranges| a.free(ranges);
    p.tokens = owned_tokens;
    p.character_runs = owned_runs;
    p.range_tags = owned_ranges;
    p.declared_units = @intCast(display.bytes.len / 2);
    p.text_present = true;
}
