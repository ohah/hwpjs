//! Follow-up input across merged pieces, using the existing text transaction.
const std = @import("std");
const Joined = @import("paragraph_joined_values.zig").Joined;

pub fn splice(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *Joined, start: u32, deleted: u32, inserted: []const u8, limit: usize) !bool {
    return spliceMode(a, tree, current, start, deleted, inserted, limit, false);
}

pub fn spliceWithTabs(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *Joined, start: u32, deleted: u32, inserted: []const u8, limit: usize) !bool {
    return spliceMode(a, tree, current, start, deleted, inserted, limit, true);
}

fn spliceMode(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *Joined, start: u32, deleted: u32, inserted: []const u8, limit: usize, allow_tabs: bool) !bool {
    const positions = if (allow_tabs) try @import("paragraph_joined_positions.zig").buildWithTabs(a, tree, current) else try @import("paragraph_joined_positions.zig").build(a, tree, current);
    defer a.free(positions);
    var draft = try current.clone(a);
    errdefer draft.deinit(a);
    const changed = if (draft.character_styles != null) block: {
        const visible = try @import("character_style_joined_projection.zig").visible(a, &draft);
        a.free(draft.character_styles.?);
        draft.character_styles = visible;
        var adapter: @import("paragraph_structure_values.zig").Paragraph = .{ .template_element = draft.pieces[0].template_element, .source_ordinal = draft.pieces[0].source_ordinal, .sites = draft.sites, .character_styles = draft.character_styles };
        const edited = try @import("character_style_splice.zig").splicePositions(a, &adapter, positions, start, deleted, inserted, limit);
        draft.sites = adapter.sites;
        draft.character_styles = adapter.character_styles;
        const restored = try @import("character_style_joined_projection.zig").restore(a, current, &draft);
        a.free(draft.character_styles.?);
        draft.character_styles = restored;
        break :block edited;
    } else try @import("text_splice_transaction.zig").spliceProjected(a, &draft.sites, positions, start, deleted, inserted, limit, null);
    _ = try draft.byteSize(limit);
    if (!changed) {
        draft.deinit(a);
        return false;
    }
    current.deinit(a);
    current.* = draft;
    return true;
}
