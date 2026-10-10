//! 원본 추가 뒤 앞쪽 문단의 현재 텍스트·서식·run 역할을 그대로 보존합니다.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const joined = @import("paragraph_joined_values.zig");

pub fn restore(a: std.mem.Allocator, original: *const model.Paragraph, rebuilt: *model.Paragraph) !void {
    var descriptor = original.*;
    descriptor.column_boundaries = null;
    var prefix = try joined.Joined.fromParagraph(a, &descriptor);
    defer prefix.deinit(a);
    var pieces: std.ArrayList(joined.Piece) = .empty;
    defer pieces.deinit(a);
    try pieces.appendSlice(a, prefix.pieces);
    var sites: std.ArrayList(@import("text_sites.zig").Site) = .empty;
    defer {
        for (sites.items) |site| a.free(site.text);
        sites.deinit(a);
    }
    for (prefix.sites.items) |site| {
        var copy = site;
        copy.text = try a.dupe(u8, site.text);
        sites.append(a, copy) catch |err| {
            a.free(copy.text);
            return err;
        };
    }
    for (rebuilt.pieces orelse return error.MissingJoinedParagraph) |piece| {
        var existing = false;
        for (prefix.pieces) |previous| if (previous.template_element == piece.template_element) {
            existing = true;
        };
        if (existing) continue;
        if (piece.output != .inventory_only) return error.SourceBindingMismatch;
        var retained = piece;
        retained.first_site = sites.items.len;
        for (rebuilt.sites.items[piece.first_site..][0..piece.site_count]) |site| {
            if (site.text.len != 0) return error.NonEmptyProvenancePiece;
            var copy = site;
            copy.text = try a.dupe(u8, site.text);
            sites.append(a, copy) catch |err| {
                a.free(copy.text);
                return err;
            };
        }
        try pieces.append(a, retained);
    }
    const owned_pieces = try pieces.toOwnedSlice(a);
    errdefer a.free(owned_pieces);
    const owned_sites = try sites.toOwnedSlice(a);
    if (rebuilt.pieces) |items| a.free(items);
    rebuilt.sites.deinit(a);
    if (rebuilt.character_styles) |items| a.free(items);
    rebuilt.pieces = owned_pieces;
    rebuilt.sites = .{ .items = owned_sites };
    rebuilt.character_styles = prefix.character_styles;
    prefix.character_styles = null;
}

pub fn appendSource(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, original: *const model.Paragraph, source: *const model.Paragraph, rebuilt: *model.Paragraph) !void {
    var left_descriptor = original.*;
    left_descriptor.column_boundaries = null;
    var right_descriptor = source.*;
    right_descriptor.column_boundaries = null;
    var left = try joined.Joined.fromParagraph(a, &left_descriptor);
    defer left.deinit(a);
    var right = try joined.Joined.fromParagraph(a, &right_descriptor);
    defer right.deinit(a);
    const styles = try @import("character_style_join.zig").prepare(a, tree, &left, &right);
    errdefer if (styles) |items| a.free(items);
    const count = std.math.add(usize, left.sites.items.len, right.sites.items.len) catch return error.LimitExceeded;
    const sites = try a.alloc(@import("text_sites.zig").Site, count);
    var initialized: usize = 0;
    errdefer {
        for (sites[0..initialized]) |site| a.free(site.text);
        a.free(sites);
    }
    for ([_]*const joined.Joined{ &left, &right }) |part| for (part.sites.items) |site| {
        sites[initialized] = site;
        sites[initialized].text = try a.dupe(u8, site.text);
        initialized += 1;
    };
    const pieces = try a.alloc(joined.Piece, std.math.add(usize, left.pieces.len, right.pieces.len) catch return error.LimitExceeded);
    errdefer a.free(pieces);
    @memcpy(pieces[0..left.pieces.len], left.pieces);
    const id = original.generated_id orelse return error.SourceBindingMismatch;
    for (right.pieces, pieces[left.pieces.len..]) |piece, *target| {
        target.* = piece;
        target.first_site = std.math.add(usize, piece.first_site, left.sites.items.len) catch return error.LimitExceeded;
        target.owns_source = false;
        target.source_ordinal = null;
        target.generated_id = id;
        if (target.output == .current_runs) target.output = .source_runs;
    }
    if (rebuilt.pieces) |items| a.free(items);
    rebuilt.sites.deinit(a);
    if (rebuilt.character_styles) |items| a.free(items);
    rebuilt.pieces = pieces;
    rebuilt.sites = .{ .items = sites };
    rebuilt.character_styles = styles;
}
