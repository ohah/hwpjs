//! Fold aligned continuation bindings only when text order is unchanged.
const std = @import("std");
const model = @import("paragraph_joined_values.zig");

pub fn prepare(a: std.mem.Allocator, joined: *const model.Joined, seam: usize, limit: usize) !?model.Joined {
    try joined.validate();
    if (seam == 0 or seam > joined.pieces.len or joined.pieces.len - seam != seam) return null;
    const left = joined.pieces[0..seam];
    const right = joined.pieces[seam..];
    const row_count = right[0].first_site;
    if (joined.sites.items.len - row_count != row_count) return null;
    for (left, right) |one, two| {
        if (two.owns_source or two.generated_id == null or two.generated_id.? == 0 or two.source_ordinal != null or one.template_element != two.template_element or one.site_count != two.site_count or one.first_site != two.first_site - row_count) return null;
    }
    var last_left: ?usize = null;
    var first_right: ?usize = null;
    for (joined.sites.items[0..row_count], joined.sites.items[row_count..], 0..) |one, two, index| {
        if (one.element_index != two.element_index or one.start != two.start or one.end != two.end or one.empty_element != two.empty_element or one.missing_text != two.missing_text or one.anchor_boundary != two.anchor_boundary) return null;
        if (one.text.len != 0) last_left = index;
        if (two.text.len != 0 and first_right == null) first_right = index;
    }
    if (last_left != null and first_right != null and last_left.? > first_right.?) return null;
    const styles = if (joined.character_styles != null)
        try @import("character_style_aligned_fold.zig").prepare(a, joined, row_count) orelse return null
    else
        null;
    errdefer if (styles) |items| a.free(items);
    const pieces = try a.dupe(model.Piece, left);
    errdefer a.free(pieces);
    for (pieces, right) |*piece, other| {
        // Folding restores the source owner's runs when either half emits them.
        piece.template_only = piece.template_only and other.template_only;
        if (piece.output == .inventory_only and other.output != .inventory_only) {
            piece.output = if (piece.owns_source) .current_runs else other.output;
        } else if (!piece.owns_source and other.output == .source_runs) {
            piece.output = .source_runs;
        }
    }
    const borrowed: @import("text_sites.zig").Sites = .{ .items = joined.sites.items[0..row_count] };
    var sites = try borrowed.clone(a);
    errdefer sites.deinit(a);
    for (sites.items, joined.sites.items[row_count..]) |*site, other| {
        if (other.text.len == 0) continue;
        const combined = try std.mem.concat(a, u8, &.{ site.text, other.text });
        a.free(site.text);
        site.text = combined;
    }
    const output: model.Joined = .{ .pieces = pieces, .sites = sites, .character_styles = styles };
    _ = try output.byteSize(limit);
    return output;
}
