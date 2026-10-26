//! Temporary host paragraph with one new table token; no source/cache mutation.
const std = @import("std");
const model = @import("../../model/document.zig");

pub fn prepare(a: std.mem.Allocator, p: model.Paragraph, unit: u32, ranges: ?@import("../body/reader.zig").Ranges, char_count: usize, limit: usize) !model.Paragraph {
    const content = @import("plain_text_content.zig");
    const before = try content.editableTextBytes(a, p);
    defer a.free(before);
    try @import("control_boundaries.zig").validateRetainedText(before);
    try @import("control_boundaries.zig").validate(before, unit, unit);
    try @import("../body/field_span.zig").protectFormulaLabels(before, unit, unit);
    try @import("character_runs.zig").validate(p.character_runs, before, char_count);
    const length = std.math.add(usize, before.len, 16) catch return error.LimitExceeded;
    if (length > limit or length / 2 > 0x7fffffff) return error.LimitExceeded;
    const after = try a.alloc(u8, length);
    defer a.free(after);
    const at = @as(usize, unit) * 2;
    @memcpy(after[0..at], before[0..at]);
    @memset(after[at..][0..16], 0);
    std.mem.writeInt(u16, after[at..][0..2], 11, .little);
    std.mem.writeInt(u32, after[at + 2 ..][0..4], @import("../body/control_rules.zig").table_id, .little);
    std.mem.writeInt(u16, after[at + 14 ..][0..2], 11, .little);
    @memcpy(after[at + 16 ..], before[at..]);
    var draft = try @import("../../model/clone.zig").paragraph(a, p);
    errdefer draft.deinit(a);
    const next_ranges = try @import("text_ranges.zig").prepareDisjoint(a, p.range_tags, ranges, before, unit, unit, 8);
    errdefer a.free(next_ranges);
    const next_runs = try @import("character_runs.zig").replace(a, p.character_runs, unit, unit, 8, null);
    errdefer a.free(next_runs);
    const next_tokens = try @import("token_ownership.zig").fromText(a, after);
    for (draft.tokens) |token| a.free(token.raw);
    a.free(draft.tokens);
    draft.tokens = next_tokens;
    a.free(draft.character_runs);
    draft.character_runs = next_runs;
    if (draft.range_tags) |old| a.free(old);
    draft.range_tags = next_ranges;
    draft.declared_units = @intCast(length / 2);
    draft.text_present = true;
    return draft;
}
