//! Current formula coordinates map to original owned exterior text sites.
const std = @import("std");
const positions = @import("paragraph_text_positions.zig");
pub const Plan = struct {
    segments: []positions.Segment,
    start: u32,
    end: u32,
    pub fn deinit(self: Plan, a: std.mem.Allocator) void {
        a.free(self.segments);
    }
};

pub fn prepare(session: *const @import("editor_session.zig").Session, section_index: usize, paragraph: usize, start: u32, end: u32) !?Plan {
    return prepareAction(session, section_index, paragraph, start, end, .splice);
}
pub fn prepareFormulaSplit(session: *const @import("editor_session.zig").Session, section_index: usize, paragraph: usize, start: u32, end: u32) !?Plan {
    return prepareAction(session, section_index, paragraph, start, end, .formula_split);
}
fn prepareAction(session: *const @import("editor_session.zig").Session, section_index: usize, paragraph: usize, start: u32, end: u32, action: @import("field_source_outside_positions.zig").Action) !?Plan {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    if (section.structure_values != null) return null;
    const a = session.allocator;
    if (!try @import("formula_section_save.zig").hasFormula(a, &section.tree)) {
        const segments = (try @import("field_source_outside_positions.zig").prepareAction(session, section_index, paragraph, start, end, action)) orelse return null;
        return .{ .segments = segments, .start = start, .end = end };
    }
    const trees = try a.alloc(@import("xml_part_tree.zig").Tree, session.sections.len);
    defer a.free(trees);
    for (session.sections, trees) |part, *tree| tree.* = part.tree;
    const prepared = try @import("formula_section_prepare.zig").prepare(a, trees, section_index, &section.sites, .{ .only_changed = false, .branch_policy = @import("editor_session.zig").siteOptions(session.options).branch_policy, .definitions = &section.formula_definitions, .result_overrides = &section.formula_result_overrides, .source_display_options = @import("editor_session.zig").siteOptions(session.options) });
    defer {
        for (prepared) |*field| field.deinit(a);
        a.free(prepared);
    }
    // Descriptor strings borrow live sites or preparations, never persist.
    const descriptors = try a.dupe(@import("text_sites.zig").Site, section.sites.items);
    defer a.free(descriptors);
    for (prepared) |field| for (field.result.items) |replacement| {
        if (replacement.site_index >= descriptors.len) return error.InvalidTextSites;
        descriptors[replacement.site_index].text = replacement.text;
    };
    var proxy = session.*;
    proxy.sections = try a.dupe(@import("editor_session.zig").Section, session.sections);
    defer a.free(proxy.sections);
    proxy.sections[section_index].sites.items = descriptors;
    const current = (try @import("field_source_outside_positions.zig").prepareAction(&proxy, section_index, paragraph, start, end, action)) orelse return null;
    defer a.free(current);
    const original = if (action == .splice)
        try @import("source_field_paragraph_positions.zig").build(session, section_index, paragraph)
    else
        try positions.build(a, &section.tree, &section.sites, section.locations, try section.sourceParagraph(paragraph));
    errdefer a.free(original);
    const boundaries = if (action == .formula_split) try @import("formula_split_boundaries.zig").map(a, trees, section_index, current, original, start, end) else @import("formula_split_boundaries.zig").Boundaries{};
    return .{ .segments = original, .start = boundaries.start orelse try mapBoundary(current, original, start), .end = boundaries.end orelse try mapBoundary(current, original, end) };
}

const mapBoundary = @import("text_site_boundary_map.zig").map;

test "formula exterior boundary mapping chooses unchanged suffix after growing and shrinking result" {
    const original = [_]positions.Segment{
        .{ .kind = .text, .index = 0, .source_start = 0, .start_unit = 0, .end_unit = 7 },
        .{ .kind = .text, .index = 1, .source_start = 1, .start_unit = 7, .end_unit = 11 },
        .{ .kind = .text, .index = 2, .source_start = 2, .start_unit = 11, .end_unit = 16 },
    };
    for ([_]usize{ 1, 5, 10 }) |width| {
        var current = original;
        current[1].end_unit = 7 + width;
        current[2].start_unit = 7 + width;
        current[2].end_unit = 12 + width;
        try std.testing.expectEqual(@as(u32, 11), try mapBoundary(&current, &original, @intCast(7 + width)));
        try std.testing.expectEqual(@as(u32, 12), try mapBoundary(&current, &original, @intCast(8 + width)));
        try std.testing.expectEqual(@as(u32, 16), try mapBoundary(&current, &original, @intCast(12 + width)));
        try std.testing.expectEqual(@as(u32, 3), try mapBoundary(&current, &original, 3));
        try std.testing.expectError(error.InvalidTextPosition, mapBoundary(&current, &original, @intCast(13 + width)));
    }
}
