//! Materialize derived formula text into a formatting transaction, not a cache.
const std = @import("std");
const editor = @import("editor_session.zig");
const Values = @import("paragraph_structure_values.zig").Values;

pub fn prepare(session: *const editor.Session, section_index: usize, values: *Values, ordinal: usize) !void {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    if (ordinal < section.first_paragraph or ordinal - section.first_paragraph >= values.paragraphs.len) return error.InvalidParagraphIndex;
    const paragraph = &values.paragraphs[ordinal - section.first_paragraph];
    const a = session.allocator;
    var projected = try @import("paragraph_structure_projection.zig").collect(a, &section.tree, values, editor.siteOptions(session.options));
    defer projected.deinit(a);
    const Tree = @import("xml_part_tree.zig").Tree;
    const trees = try a.alloc(Tree, session.sections.len);
    defer a.free(trees);
    for (session.sections, trees) |value, *tree| tree.* = value.tree;
    const prepared = try @import("formula_section_prepare.zig").prepare(a, trees, section_index, &projected, .{ .branch_policy = editor.siteOptions(session.options).branch_policy, .definitions = &section.formula_definitions, .result_overrides = &section.formula_result_overrides, .source_display_options = editor.siteOptions(session.options) });
    defer {
        for (prepared) |*field| field.deinit(a);
        a.free(prepared);
    }
    const rebasing = @import("character_style_formula_ranges.zig");
    var replacements: std.ArrayList(rebasing.Replacement) = .empty;
    defer replacements.deinit(a);
    for (prepared) |field| try @import("character_style_formula_bindings.zig").appendChanged(a, &replacements, &projected, &paragraph.sites, field.result.items);
    if (replacements.items.len == 0) return;
    if (paragraph.character_styles) |styles| {
        const ranges = try rebasing.rebase(a, &paragraph.sites, styles, replacements.items, session.options.max_sites);
        defer a.free(ranges);
        var base: usize = 0;
        var normalized: std.ArrayList(@import("character_style_paint.zig").Span) = .empty;
        defer normalized.deinit(a);
        for (styles, ranges, 0..) |original, range, index| {
            var style = original;
            if (index == 0 or style.site_index != styles[index - 1].site_index or style.anchor_element != null or style.tab_element != null) base = range.start_unit;
            style.start_unit = range.start_unit;
            style.end_unit = range.end_unit;
            style.site_start_unit = base;
            if (style.anchor_element == null and style.tab_element == null and range.start_unit == range.end_unit) {
                var text: []const u8 = paragraph.sites.items[style.site_index].text;
                for (replacements.items) |replacement| if (replacement.site_index == style.site_index) {
                    text = replacement.text;
                };
                if (text.len != 0 or (index != 0 and styles[index - 1].site_index == style.site_index)) continue;
            }
            try @import("character_style_paint.zig").append(a, &normalized, style, session.options.max_sites);
        }
        const owned = try normalized.toOwnedSlice(a);
        a.free(styles);
        paragraph.character_styles = owned;
    }
    for (replacements.items) |replacement| {
        const owned = try a.dupe(u8, replacement.text);
        const site = &paragraph.sites.items[replacement.site_index];
        a.free(site.text);
        site.text = owned;
    }
}
