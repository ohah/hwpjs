//! Internal derived-label materialization into a transaction-owned paragraph.
//! Caller must validate source ownership/resources and the original range view.
const std = @import("std");
const model = @import("../../model/document.zig");
const body = @import("../body/reader.zig");

pub const Change = struct { start_unit: u32, end_unit: u32, added_units: u32 };
pub fn applyDraft(a: std.mem.Allocator, p: *model.Paragraph, before: []const u8, after: []const u8, change: Change, source_ranges: ?body.Ranges, char_count: usize) !void {
    if (before.len % 2 != 0 or after.len % 2 != 0) return error.InvalidTextSize;
    if (before.len / 2 != p.declared_units) return error.SourceBindingMismatch;
    if (change.start_unit > change.end_unit or change.end_unit > before.len / 2) return error.InvalidTextPosition;
    const units = std.math.add(usize, before.len / 2 - (change.end_unit - change.start_unit), change.added_units) catch return error.LimitExceeded;
    if (units != after.len / 2) return error.SourceBindingMismatch;
    if (after.len > 8 * 1024 * 1024) return error.LimitExceeded;
    const start = @as(usize, change.start_unit) * 2;
    const end = @as(usize, change.end_unit) * 2;
    const added = @as(usize, change.added_units) * 2;
    if (!std.mem.eql(u8, before[0..start], after[0..start]) or !std.mem.eql(u8, before[end..], after[start + added ..])) return error.SourceBindingMismatch;
    try @import("control_boundaries.zig").validate(before, change.start_unit, change.end_unit);
    try @import("field_display_bytes.zig").validateLabel(after[start .. start + added]);
    if (std.mem.eql(u8, before, after)) return;
    const runs = @import("character_runs.zig");
    try runs.validate(p.character_runs, before, char_count);
    const owned_runs = try runs.replace(a, p.character_runs, change.start_unit, change.end_unit, change.added_units, null);
    errdefer a.free(owned_runs);
    const owned_ranges = try @import("text_ranges.zig").prepare(a, p.range_tags, source_ranges, before, change.start_unit, change.end_unit, change.added_units);
    errdefer a.free(owned_ranges);
    var tokens: std.ArrayList(model.Token) = .empty;
    errdefer {
        for (tokens.items) |token| a.free(token.raw);
        tokens.deinit(a);
    }
    var it = (try body.Text.parse(after)).tokens();
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
    p.declared_units = @intCast(after.len / 2);
    p.text_present = true;
}
