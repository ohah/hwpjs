//! Shared owned text/run projection for paired structural split drafts.
const std = @import("std");
const model = @import("../../model/document.zig");

pub fn replace(a: std.mem.Allocator, p: *model.Paragraph, bytes: []const u8, start: u32, end: u32) !void {
    const ranges = try a.alloc(model.TextRange, 0);
    errdefer a.free(ranges);
    const runs = try @import("character_runs.zig").replace(a, p.character_runs, start, end, 0, null);
    errdefer a.free(runs);
    const tokens = try @import("token_ownership.zig").fromText(a, bytes);
    for (p.tokens) |token| a.free(token.raw);
    a.free(p.tokens);
    a.free(p.character_runs);
    if (p.range_tags) |old| a.free(old);
    p.tokens = tokens;
    p.character_runs = runs;
    p.range_tags = ranges;
    p.text_present = true;
    p.declared_units = @intCast(bytes.len / 2);
}
