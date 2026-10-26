//! Read-only formula/style projection using current input strings, no save/reparse.
const std = @import("std");
const editor = @import("editor_session.zig");
const Range = @import("character_style_display_ranges.zig").Range;
const sites_mod = @import("text_sites.zig");

pub fn read(session: *const editor.Session, section_index: usize, ordinal: usize) !?[]Range {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    if (ordinal < section.first_paragraph or ordinal > section.last_paragraph) return error.InvalidParagraphIndex;
    if (section.structure_values) |values| {
        if (ordinal - section.first_paragraph >= values.paragraphs.len) return error.InvalidParagraphIndex;
    }
    const a = session.allocator;
    const paragraph = if (section.structure_values) |*values| &values.paragraphs[ordinal - section.first_paragraph] else null;
    const template = if (paragraph) |value| value.template_element else try @import("paragraph_site_owner.zig").resolve(&section.tree, &section.sites, section.locations, ordinal);
    var found = false;
    var owned = try @import("paragraph_owned_elements.zig").Iterator.init(&section.tree, template);
    while (try owned.next()) |index| {
        const element = section.tree.elements[index];
        if (!element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) continue;
        const raw = (try section.tree.attributeValue(a, index, "", "type")) orelse continue;
        const kind = try raw.toUtf8(a, 4096);
        defer a.free(kind);
        if (std.mem.eql(u8, kind, "FORMULA")) {
            found = true;
            break;
        }
    }
    if (!found) return null;
    var projection: ?sites_mod.Sites = if (section.structure_values) |*values| try @import("paragraph_structure_projection.zig").collect(a, &section.tree, values, editor.siteOptions(session.options)) else null;
    defer if (projection) |*value| value.deinit(a);
    const input = if (projection) |*value| value else &section.sites;
    const trees = try a.alloc(@import("xml_part_tree.zig").Tree, session.sections.len);
    defer a.free(trees);
    for (session.sections, trees) |value, *tree| tree.* = value.tree;
    const prepared = try @import("formula_section_prepare.zig").prepare(a, trees, section_index, input, .{ .branch_policy = editor.siteOptions(session.options).branch_policy, .definitions = &section.formula_definitions, .result_overrides = &section.formula_result_overrides, .source_display_options = editor.siteOptions(session.options) });
    defer {
        for (prepared) |*field| field.deinit(a);
        a.free(prepared);
    }
    var descriptors: std.ArrayList(sites_mod.Site) = .empty;
    defer descriptors.deinit(a);
    var locations: std.ArrayList(@import("section_text.zig").Location) = .empty;
    defer locations.deinit(a);
    if (paragraph) |value| {
        try descriptors.appendSlice(a, value.sites.items);
        const rows = try @import("paragraph_structure_locations.zig").build(a, &section.tree, value);
        defer a.free(rows);
        try locations.appendSlice(a, rows);
    } else {
        for (section.sites.items, section.locations) |site, location| if (location.paragraph_ordinal == ordinal) {
            try descriptors.append(a, site);
            try locations.append(a, location);
        };
    }
    const local: sites_mod.Sites = .{ .items = descriptors.items };
    const rebasing = @import("character_style_formula_ranges.zig");
    var replacements: std.ArrayList(rebasing.Replacement) = .empty;
    defer replacements.deinit(a);
    for (prepared) |field| try @import("character_style_formula_bindings.zig").appendChanged(a, &replacements, input, &local, field.result.items);
    // An unchanged stored result still needs the formula-owned projection.
    // Falling back to the plain/anchor edit policy rejects its field markers,
    // including a valid table anchor next to the result after save/reopen.
    if (paragraph) |value| if (value.character_styles) |styles| return try rebasing.rebase(a, &local, styles, replacements.items, session.options.max_sites);
    // FORMULA discovery and formula_section_prepare above establish this field projection.
    // This remains a display projection, never text-edit permission.
    const positions = try @import("anchor_text_positions.zig").buildForFieldText(a, &section.tree, &local, locations.items, if (paragraph != null) 1 else ordinal);
    defer a.free(positions);
    const typed = try @import("character_style_anchor_projection.zig").build(a, &section.tree, &local, positions, session.options.max_sites);
    defer a.free(typed);
    const spans = try @import("character_style_anchor_adapter.zig").fromTyped(a, &section.tree, &local, typed);
    defer a.free(spans);
    return try rebasing.rebase(a, &local, spans, replacements.items, session.options.max_sites);
}
