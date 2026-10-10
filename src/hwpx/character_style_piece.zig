//! Temporary piece-local style adapter; current Joined retains sole ownership.
const std = @import("std");
const Span = @import("character_style_paint.zig").Span;
pub fn partition(a: std.mem.Allocator, current: *const @import("paragraph_joined_values.zig").Joined, index: usize) !?[]Span {
    const styles = current.character_styles orelse return null;
    if (index >= current.pieces.len) return error.InvalidParagraphIndex;
    const piece = current.pieces[index];
    var output: std.ArrayList(Span) = .empty;
    defer output.deinit(a);
    var base: ?usize = null;
    for (styles) |span| {
        if (span.site_index < piece.first_site or span.site_index - piece.first_site >= piece.site_count) continue;
        if (base == null) base = span.site_start_unit;
        if (span.start_unit < base.? or span.end_unit < base.? or span.site_start_unit < base.?) return error.InvalidTextSites;
        var local = span;
        local.site_index -= piece.first_site;
        local.start_unit -= base.?;
        local.end_unit -= base.?;
        local.site_start_unit -= base.?;
        try output.append(a, local);
    }
    if (piece.site_count != 0 and output.items.len == 0) return error.InvalidTextSites;
    return try output.toOwnedSlice(a);
}
