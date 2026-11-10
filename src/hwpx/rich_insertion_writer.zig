//! Resolve resources for the grouped insertion inside existing owned History.
//! First encounter order is the legacy range/property/language order.
const std = @import("std");
const Session = @import("editor_session.zig").Session;
const Patch = @import("../model/formatting_patch.zig").Patch;
const CharPatch = @import("../model/document.zig").CharacterPropertyPatch;
const Fonts = @import("../model/character_fonts.zig").Values;
const Resources = @import("rich_insertion_ranges.zig");
const FontLookup = @import("../model/batch_font_lookup.zig").Cache;
const properties = @import("character_property_session.zig");

pub fn apply(session: *Session, selection: *Resources.Plan, patch: Patch, fonts: *FontLookup) !bool {
    if (!session.history_delta_managed or !session.history_transaction_active) return error.IndependentTextRequiresHistory;
    const batch = session.formatting_batch orelse return error.InvalidIndependentTextCommand;
    if (patch.reset != null or patch.hasParagraph()) return error.UnsupportedTextInsertionFormatting;
    const a = session.allocator;
    const document = try batch.originalDocument(a, session.source);
    const resources = try batch.originalResources(a, document);
    const original_ids = resources.table(.char_shape).ids.items;
    var character = patch.character;
    for (patch.fonts, 0..) |font, language| if (font) |value| switch (value) {
        .id => |id| {
            var ids = character.font_ids orelse @as(Fonts, @splat(null));
            ids[language] = id;
            character.font_ids = ids;
        },
        .name => |name| try @import("../model/font_name.zig").validate(name, @import("../model/formatting_patch.zig").limits.font_name_bytes),
    };
    try @import("../model/character_properties.zig").validate(character);
    if (character.outline_kind) |kind| _ = try @import("character_outline_kind.zig").token(kind);
    if (character.font_ids) |ids| try properties.validateBatchFontIds(session, document, ids);
    var decoration_tree = if (character.underline_kind != null or character.strike_enabled != null or character.strike_color != null)
        try document.readHeaderTree(a, .{})
    else
        null;
    defer if (decoration_tree) |*tree| tree.deinit(a);
    const underline = @import("character_underline_snapshot.zig");
    const colors = if (character.underline_color != null) try underline.readFull(session) else null;
    defer if (colors) |rows| underline.deinit(a, rows);

    var changed = false;
    var budget = Resources.SpanBudget.init(selection, session.options.max_sites);
    for (selection.cuts.items) |cut| {
        if (properties.hasProperties(character)) {
            try budget.validate(selection, cut);
            changed = (try resolve(session, selection, cut, 0, &budget, original_ids, character, if (decoration_tree) |*tree| tree else null, colors)) or changed;
        }
        for (patch.fonts, 0..) |font, language| if (font) |value| switch (value) {
            .id => {},
            .name => |name| {
                try budget.validate(selection, cut);
                const before = session.font_resources.entries.items.len;
                const id = fonts.get(language, name) orelse blk: {
                    selection.count("font_ensures");
                    break :blk try @import("font_creation.zig").ensure(session, @fromBackingInt(@intCast(language)), name);
                };
                fonts.put(language, name, id);
                var ids: Fonts = @splat(null);
                ids[language] = id;
                changed = (try resolve(session, selection, cut, language + 1, &budget, original_ids, .{ .font_ids = ids }, null, null)) or changed;
                changed = session.font_resources.entries.items.len != before or changed;
            },
        };
    }
    return changed;
}

fn resolve(session: *Session, selection: *Resources.Plan, cut: Resources.Cut, stage: usize, budget: *Resources.SpanBudget, original_ids: []const u32, patch: CharPatch, tree: ?*const @import("xml_part_tree.zig").Tree, colors: ?[]const @import("character_underline_snapshot.zig").FullRow) !bool {
    var changed = false;
    const pieces = selection.pieces.items;
    var first = cut.first;
    while (first < cut.end) {
        if (pieces[first].resource == null) {
            first += 1;
            continue;
        }
        selection.count("paint_steps");
        const previous = pieces[first].span.char_shape_id orelse return error.InvalidCharacterShapeReference;
        var end = first + 1;
        while (end < cut.end and Resources.joins(pieces[end - 1].span, pieces[end].span)) end += 1;
        const resource = &selection.resources.items[pieces[first].resource.?];
        const id = resource.stages[stage] orelse blk: {
            selection.count("resource_steps");
            break :blk (try properties.resolveResource(session, previous, patch, original_ids, null, tree, colors)) orelse previous;
        };
        for (pieces[first..end]) |piece| selection.resources.items[piece.resource.?].stages[stage] = id;
        if (previous != id) {
            try budget.replace(selection, .{ .first = first, .end = end }, id);
            changed = true;
        }
        first = end;
    }
    return changed;
}
