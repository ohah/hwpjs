//! Validate formula-bearing edits in a temporary owned Sites transaction.
const std = @import("std");
const sites_mod = @import("text_sites.zig");

pub fn splice(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, current: *sites_mod.Sites, locations: []const @import("section_text.zig").Location, paragraph: usize, start: u32, deleted: u32, inserted: []const u8, max_bytes: usize) !bool {
    return spliceMode(a, trees, section, current, locations, paragraph, start, deleted, inserted, max_bytes, false);
}

pub fn spliceMode(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, current: *sites_mod.Sites, locations: []const @import("section_text.zig").Location, paragraph: usize, start: u32, deleted: u32, inserted: []const u8, max_bytes: usize, anchored: bool) !bool {
    return spliceWithDefinitions(a, trees, section, current, locations, paragraph, start, deleted, inserted, max_bytes, anchored, null);
}

pub fn spliceWithDefinitions(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, current: *sites_mod.Sites, locations: []const @import("section_text.zig").Location, paragraph: usize, start: u32, deleted: u32, inserted: []const u8, max_bytes: usize, anchored: bool, definitions: ?*const @import("formula_definition_values.zig").Values) !bool {
    return spliceWithOverrides(a, trees, section, current, locations, paragraph, start, deleted, inserted, max_bytes, anchored, definitions, null, @import("editor_session.zig").siteOptions(.{}));
}

pub fn spliceWithOverrides(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, current: *sites_mod.Sites, locations: []const @import("section_text.zig").Location, paragraph: usize, start: u32, deleted: u32, inserted: []const u8, max_bytes: usize, anchored: bool, definitions: ?*const @import("formula_definition_values.zig").Values, overrides: ?*@import("formula_result_override_values.zig").Values, source_options: sites_mod.Options) !bool {
    if (section >= trees.len) return error.InvalidSectionIndex;
    var draft = try current.clone(a);
    return finish(a, trees, section, current, &draft, locations, paragraph, start, deleted, inserted, max_bytes, anchored, definitions, overrides, source_options);
}

fn finish(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, current: *sites_mod.Sites, draft: *sites_mod.Sites, locations: []const @import("section_text.zig").Location, paragraph: usize, start: u32, deleted: u32, inserted: []const u8, max_bytes: usize, anchored: bool, definitions: ?*const @import("formula_definition_values.zig").Values, overrides: ?*@import("formula_result_override_values.zig").Values, source_options: sites_mod.Options) !bool {
    defer draft.deinit(a);
    const changed = if (anchored)
        try @import("anchor_paragraph_edit.zig").splice(a, &trees[section], draft, locations, paragraph, start, deleted, inserted, max_bytes)
    else
        try @import("plain_paragraph_edit.zig").spliceWithTabs(a, &trees[section], draft, locations, paragraph, start, deleted, inserted, max_bytes, true);
    if (!changed) return false;
    return prepareAndCommit(a, trees, section, current, draft, definitions, overrides, source_options);
}

/// Caller supplies validated field-exterior positions and range permission.
/// Formula validation still happens before publishing any current text.
pub fn spliceProjected(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, current: *sites_mod.Sites, positions: []const @import("paragraph_text_positions.zig").Segment, start: u32, deleted: u32, inserted: []const u8, max_bytes: usize, definitions: ?*const @import("formula_definition_values.zig").Values) !bool {
    return spliceProjectedWithOverrides(a, trees, section, current, positions, start, deleted, inserted, max_bytes, definitions, null, @import("editor_session.zig").siteOptions(.{}));
}

pub fn spliceProjectedWithOverrides(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, current: *sites_mod.Sites, positions: []const @import("paragraph_text_positions.zig").Segment, start: u32, deleted: u32, inserted: []const u8, max_bytes: usize, definitions: ?*const @import("formula_definition_values.zig").Values, overrides: ?*@import("formula_result_override_values.zig").Values, source_options: sites_mod.Options) !bool {
    if (section >= trees.len) return error.InvalidSectionIndex;
    var draft = try current.clone(a);
    defer draft.deinit(a);
    if (!try @import("text_splice_transaction.zig").spliceProjected(a, &draft, positions, start, deleted, inserted, max_bytes, null)) return false;
    return prepareAndCommit(a, trees, section, current, &draft, definitions, overrides, source_options);
}

fn prepareAndCommit(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, current: *sites_mod.Sites, draft: *sites_mod.Sites, definitions: ?*const @import("formula_definition_values.zig").Values, overrides: ?*@import("formula_result_override_values.zig").Values, source_options: sites_mod.Options) !bool {
    try @import("formula_numeric_input_guard.zig").validateFormulaTransition(a, trees, section, current, draft, definitions);
    var seeded: ?@import("formula_result_override_values.zig").Values = if (overrides) |values| try @import("formula_source_result_seed.zig").prepare(a, trees, section, current, definitions, values, source_options) else null;
    defer if (seeded) |*values| values.deinit(a);
    var candidate: ?@import("formula_result_override_values.zig").Values = if (seeded) |*values| if (values.entries.items.len != 0) try @import("formula_result_override_invalidation.zig").prepare(a, trees, section, current, draft, definitions, values) else null else null;
    defer if (candidate) |*values| values.deinit(a);
    const prepared = try @import("formula_section_prepare.zig").prepare(a, trees, section, draft, .{ .definitions = definitions, .result_overrides = if (candidate) |*values| values else overrides });
    defer {
        for (prepared) |*field| field.deinit(a);
        a.free(prepared);
    }
    std.mem.swap(sites_mod.Sites, current, draft);
    if (candidate) |*values| std.mem.swap(@import("formula_result_override_values.zig").Values, values, overrides.?);
    return true;
}
