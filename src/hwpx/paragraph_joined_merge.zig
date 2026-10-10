//! Atomic ordered provenance merge, retaining each run's current text binding.
const std = @import("std");
const model = @import("paragraph_joined_values.zig");

pub fn prepare(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, left: *const model.Joined, right: *const model.Joined, limit: usize) !model.Joined {
    return prepareMode(a, tree, left, right, limit, false, false, false);
}

pub fn prepareWithTabs(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, left: *const model.Joined, right: *const model.Joined, limit: usize) !model.Joined {
    return prepareMode(a, tree, left, right, limit, true, false, false);
}

pub fn prepareWithAnchors(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, left: *const model.Joined, right: *const model.Joined, limit: usize) !model.Joined {
    return prepareMode(a, tree, left, right, limit, true, true, false);
}

/// 좌표 소유 계획과 저장 허용 정책을 갖춘 호출자 전용입니다.
pub fn prepareWithColumnPageAreas(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, left: *const model.Joined, right: *const model.Joined, limit: usize) !model.Joined {
    return prepareMode(a, tree, left, right, limit, false, false, true);
}

fn prepareMode(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, left: *const model.Joined, right: *const model.Joined, limit: usize, allow_tabs: bool, anchors: bool, page_areas: bool) !model.Joined {
    try left.validate();
    try right.validate();
    if (allow_tabs and (left.character_styles != null or right.character_styles != null)) return error.UnsupportedAnchoredStructure;
    for ([_]*const model.Joined{ left, right }) |value| {
        const positions = if (anchors) try @import("paragraph_joined_positions.zig").buildWithAnchors(a, tree, value) else if (allow_tabs) try @import("paragraph_joined_positions.zig").buildWithTabs(a, tree, value) else try @import("paragraph_joined_positions.zig").build(a, tree, value);
        a.free(positions);
    }
    const count = std.math.add(usize, left.pieces.len, right.pieces.len) catch return error.LimitExceeded;
    const pieces = try a.alloc(model.Piece, count);
    errdefer a.free(pieces);
    @memcpy(pieces[0..left.pieces.len], left.pieces);
    for (right.pieces, pieces[left.pieces.len..]) |piece, *copy| {
        copy.* = piece;
        copy.first_site = std.math.add(usize, left.sites.items.len, piece.first_site) catch return error.LimitExceeded;
    }
    const site_count = std.math.add(usize, left.sites.items.len, right.sites.items.len) catch return error.LimitExceeded;
    const rows = try a.alloc(@import("text_sites.zig").Site, site_count);
    var initialized: usize = 0;
    errdefer {
        for (rows[0..initialized]) |site| a.free(site.text);
        a.free(rows);
    }
    for ([_]*const model.Joined{ left, right }) |value| for (value.sites.items) |site| {
        rows[initialized] = site;
        rows[initialized].text = try a.dupe(u8, site.text);
        initialized += 1;
    };
    const styles = try @import("character_style_join.zig").prepare(a, tree, left, right);
    errdefer if (styles) |items| a.free(items);
    const output: model.Joined = .{ .pieces = pieces, .sites = .{ .items = rows }, .character_styles = styles };
    if (page_areas) try @import("paragraph_joined_boundary.zig").validateWithColumnPageAreas(a, tree, &output, left.pieces.len) else if (anchors) try @import("paragraph_joined_boundary.zig").validateWithAnchors(a, tree, &output, left.pieces.len) else if (allow_tabs) try @import("paragraph_joined_boundary.zig").validateWithTabs(a, tree, &output, left.pieces.len) else try @import("paragraph_joined_boundary.zig").validate(a, tree, &output, left.pieces.len);
    if (allow_tabs) {
        const checked = if (anchors) try @import("paragraph_joined_positions.zig").buildWithAnchors(a, tree, &output) else try @import("paragraph_joined_positions.zig").buildWithTabs(a, tree, &output);
        a.free(checked);
    }
    if (!allow_tabs) if (try @import("paragraph_joined_fold.zig").prepare(a, &output, left.pieces.len, limit)) |folded| {
        var owned = output;
        owned.deinit(a);
        return folded;
    };
    _ = try output.byteSize(limit);
    return output;
}
