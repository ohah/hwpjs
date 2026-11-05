//! Atomic property painting preserves each selected run's other properties.
const std = @import("std");
const model = @import("../../model/document.zig");
const Values = @import("character_resource_values.zig").Values;
/// Pending resources are owned here until the existing History calls final flush.
/// Document never borrows ArrayList capacity: rollback may deinit Document safely.
pub const Context = struct {
    pending: ?Values = null,
    source_contexts: std.AutoHashMapUnmanaged(usize, @import("plain_text_source.zig").CharacterContext) = .empty,
    shapes: ?@import("character_batch_shape_context.zig").Context = null,
    intent_index: @import("character_resource_values.zig").IntentIndex = .{},
    font_counts: ?[7]u32 = null,
    invalid_font_overlay: [7]bool = @splat(false),
    font_overlay_seen: usize = 0,
    font_inventory_builds: usize = 0,
    changed: bool = false,
    disabled: bool = false,
    installed: bool = false,
    original_prepares: usize = 0,
    final_flushes: usize = 0,
    pub fn deinit(self: *Context, a: std.mem.Allocator) void {
        var contexts = self.source_contexts.valueIterator();
        while (contexts.next()) |value| value.deinit(a);
        self.source_contexts.deinit(a);
        self.intent_index.deinit(a);
        if (self.shapes) |*value| value.deinit(a);
        if (self.pending) |*value| value.deinit(a);
        self.* = .{};
    }
    pub fn abort(self: *Context, a: std.mem.Allocator) void {
        self.deinit(a);
        self.disabled = true;
    }
    pub fn entries(self: *const Context, document: *const model.Document) []const model.CharacterResourceIntent {
        return if (!self.disabled and !self.installed and self.pending != null) self.pending.?.entries.items else document.character_resources;
    }
    pub fn prepare(self: *Context, a: std.mem.Allocator, original_info: []const u8, version: @import("../version.zig").Version, original_count: usize, document: *const model.Document, limit: usize) !void {
        if (self.pending) |*pending| {
            try @import("character_display_shapes.zig").validateReadCount(original_count + pending.entries.items.len);
            return;
        }
        const borrowed: Values = .{ .entries = .{ .items = document.character_resources, .capacity = document.character_resources.len, .pointer_stability = .{} } };
        // One original canonical validation, at the old materialize/read phase.
        const current = try borrowed.writeBatch(a, original_info, version, original_count, limit);
        defer a.free(current);
        const checked = try @import("character_display_shapes.zig").read(a, current, version, original_count + document.character_resources.len);
        defer a.free(checked);
        self.pending = try borrowed.clone(a);
        self.shapes = @import("character_batch_shape_context.zig").Context.initAfterValidation(original_info, version, original_count, limit);
        self.original_prepares += 1;
    }
    pub fn install(self: *Context, a: std.mem.Allocator, document: *model.Document) !void {
        if (self.installed or self.pending == null or !self.changed) return;
        const owned = try self.pending.?.entries.toOwnedSlice(a);
        a.free(document.character_resources);
        document.character_resources = owned;
        self.installed = true;
    }
};
pub const Edit = struct { section: usize, paragraph: usize, start_unit: u32, end_unit: u32, properties: model.CharacterPropertyPatch };
pub fn apply(a: std.mem.Allocator, source: []const u8, original_info: []const u8, version: @import("../version.zig").Version, document: *model.Document, edit: Edit, original_count: usize, limit: usize) !void {
    return applyScoped(a, source, original_info, version, document, edit, original_count, limit, null);
}
pub fn applyScoped(a: std.mem.Allocator, source: []const u8, original_info: []const u8, version: @import("../version.zig").Version, document: *model.Document, edit: Edit, original_count: usize, limit: usize, batch: ?*Context) !void {
    try @import("character_property_payload.zig").validate(edit.properties);
    if (batch) |context| {
        var unsupported = context.disabled or context.installed or edit.properties.border_fill != null;
        if (context.pending == null) {
            for (document.character_resources) |entry| unsupported = unsupported or entry.properties.border_fill != null;
        }
        if (unsupported) {
            // Only entered before any unsupported mutation; publish the already
            // validated prefix into model ownership before the old fallback.
            if (context.pending) |*pending| {
                const verified = try pending.writeBatch(a, original_info, version, original_count, limit);
                defer a.free(verified);
                try context.install(a, document);
            }
            context.disabled = true;
            return applyScoped(a, source, original_info, version, document, edit, original_count, limit, null);
        }
    }
    const resources = if (batch) |context| context.entries(document) else document.character_resources;
    if (edit.properties.font_ids) |ids| {
        if (batch) |context| {
            if (context.font_counts == null or document.font_resources.entries.items.len < context.font_overlay_seen) {
                const fonts = try @import("../docinfo/resources.zig").inspect(original_info, version, .{});
                try fonts.validate();
                var counts: [7]u32 = undefined;
                for (&counts, 0..) |*count, language| count.* = @intCast(fonts.fontCount(@fromBackingInt(@intCast(language))));
                context.font_counts = counts;
                context.invalid_font_overlay = @splat(false);
                context.font_overlay_seen = 0;
                context.font_inventory_builds += 1;
            }
            for (document.font_resources.entries.items[context.font_overlay_seen..]) |font| {
                const language: usize = @backingInt(font.language);
                const current = context.font_counts.?[language];
                if (!context.invalid_font_overlay[language]) {
                    if (font.id != current or current > std.math.maxInt(u16)) context.invalid_font_overlay[language] = true else context.font_counts.?[language] += 1;
                }
            }
            context.font_overlay_seen = document.font_resources.entries.items.len;
            for (ids, 0..) |id, language| if (id) |value| {
                if (context.invalid_font_overlay[language] or value >= context.font_counts.?[language]) return error.InvalidFontId;
            };
        } else {
            const fonts = try @import("../docinfo/resources.zig").inspect(original_info, version, .{});
            try fonts.validate();
            for (ids, 0..) |id, language| if (id) |value| {
                var count: u32 = @intCast(fonts.fontCount(@fromBackingInt(@intCast(language))));
                for (document.font_resources.entries.items) |font| if (@backingInt(font.language) == language) {
                    if (font.id != count or count > std.math.maxInt(u16)) return error.InvalidFontId;
                    count += 1;
                };
                if (value >= count) return error.InvalidFontId;
            };
        }
    }
    if (edit.section >= document.sections.len) return error.InvalidSection;
    if (edit.paragraph >= document.sections[edit.section].paragraphs.len) return error.InvalidParagraph;
    const target = &document.sections[edit.section].paragraphs[edit.paragraph];
    const count = original_count + resources.len;
    const source_context = if (batch) |context| block: {
        const slot = try context.source_contexts.getOrPut(a, edit.section);
        if (!slot.found_existing) slot.value_ptr.* = .{ .source = source, .version = version };
        break :block slot.value_ptr;
    } else null;
    if (source_context) |context| {
        _ = try @import("plain_text_source.zig").validateCharacterFormatScoped(a, context, source, version, target.*, count);
    } else _ = try @import("plain_text_source.zig").validateCharacterFormat(a, source, version, target.*, count);
    const text = try @import("plain_text_content.zig").editableTextBytes(a, target.*);
    defer a.free(text);
    try @import("control_boundaries.zig").validateRetainedText(text);
    try @import("control_boundaries.zig").validate(text, edit.start_unit, edit.end_unit);
    try @import("character_runs.zig").validate(target.character_runs, text, count);
    if (edit.start_unit == edit.end_unit) return;
    const borrowed: Values = .{ .entries = .{ .items = @constCast(resources), .capacity = resources.len, .pointer_stability = .{} } };
    var current_owned: ?[]u8 = null;
    defer if (current_owned) |bytes| a.free(bytes);
    var shapes_owned: ?[]@import("character_display_shapes.zig").Shape = null;
    defer if (shapes_owned) |values| a.free(values);
    var pending_owned: ?Values = null;
    defer if (pending_owned) |*value| value.deinit(a);
    const pending = if (batch) |context| block: {
        try context.prepare(a, original_info, version, original_count, document, limit);
        break :block &context.pending.?;
    } else block: {
        current_owned = try borrowed.write(a, original_info, version, original_count, limit);
        shapes_owned = try @import("character_display_shapes.zig").read(a, current_owned.?, version, count);
        pending_owned = try borrowed.clone(a);
        break :block &pending_owned.?;
    };
    var paragraph = try @import("../../model/clone.zig").paragraph(a, target.*);
    defer paragraph.deinit(a);
    var changed = false;
    for (target.character_runs, 0..) |run, index| {
        const end = if (index + 1 < target.character_runs.len) target.character_runs[index + 1].start_unit else target.declared_units;
        const start = @max(run.start_unit, edit.start_unit);
        const stop = @min(end, edit.end_unit);
        if (start >= stop) continue;
        const shape = if (batch) |context| (try context.shapes.?.resolve(a, pending.entries.items, run.char_shape_id)) orelse return error.UnsupportedBatchCharacterResource else shapes_owned.?[run.char_shape_id];
        const border_matches = if (edit.properties.border_fill) |border| try @import("border_fill_character_current.zig").matches(current_owned.?, version, run.char_shape_id, border) else true;
        const decoration = @import("character_decoration_compat.zig").resolve(shape);
        const strike_color_matches = edit.properties.strike_color == null or (shape.strike_kind_raw <= 1 and decoration.strike_color != null and @import("../../model/rgb_color.zig").hwp5(edit.properties.strike_color.?) == decoration.strike_color.?);
        const extra_matches = (edit.properties.shadow == null or @import("../../model/character_shadow.zig").matches(shape.shadow, edit.properties.shadow.?)) and @import("../../model/character_metric_patch.zig").matches(shape.font_metrics, edit.properties) and
            (edit.properties.underline_style == null or @import("../../model/character_line_style.zig").hwp5(edit.properties.underline_style.?) == shape.underline_style_raw) and
            (edit.properties.strike_style == null or @import("../../model/character_line_style.zig").hwp5(edit.properties.strike_style.?) == decoration.strike_style);
        if (border_matches and extra_matches and strike_color_matches and (edit.properties.outline_kind == null or shape.outline_kind_raw == @import("character_outline_kind.zig").raw(edit.properties.outline_kind.?)) and @import("../../model/character_properties.zig").effectsMatch(edit.properties, shape.effects) and (edit.properties.shade == null or try @import("../../model/shade_color.zig").encodeHwp5(edit.properties.shade.?) == shape.shade_color_raw))
            if ((edit.properties.strike_enabled == null or edit.properties.strike_enabled.? == decoration.strike_enabled) and (edit.properties.size == null or edit.properties.size.? == shape.height) and (edit.properties.bold == null or edit.properties.bold.? == shape.bold) and (edit.properties.italic == null or edit.properties.italic.? == shape.italic) and (edit.properties.underline_kind == null or @backingInt(edit.properties.underline_kind.?) == decoration.underline_kind) and (edit.properties.underline_color == null or @import("../../model/rgb_color.zig").hwp5(edit.properties.underline_color.?) == shape.underline_color_raw) and (edit.properties.text_color == null or @import("../../model/rgb_color.zig").hwp5(edit.properties.text_color.?) == shape.text_color_raw) and (edit.properties.font_ids == null or @import("../../model/character_fonts.zig").matches(@import("../../model/character_fonts.zig").fromHwp5(shape.font_ids), edit.properties.font_ids.?))) continue;
        var source_id = run.char_shape_id;
        var properties: model.CharacterPropertyPatch = .{};
        if (source_id >= original_count) {
            const intent = pending.entries.items[source_id - original_count];
            source_id = intent.source_id;
            properties = intent.properties;
        }
        const source_shape = if (batch) |context| (try context.shapes.?.resolve(a, pending.entries.items, source_id)) orelse return error.UnsupportedBatchCharacterResource else shapes_owned.?[source_id];
        properties = try @import("character_decoration_patch_merge.zig").merge(source_shape, shape, properties, edit.properties);
        const indexed = if (batch) |context| try pending.addIndexed(a, &context.intent_index, original_count, source_id, properties) else null;
        const id = indexed orelse try pending.add(a, original_count, source_id, properties);
        try @import("character_format.zig").applyScoped(a, source, version, &paragraph, .{ .section = edit.section, .paragraph = edit.paragraph, .start_unit = start, .end_unit = stop, .char_shape_id = id }, original_count + pending.entries.items.len, source_context);
        if (batch) |context| _ = (try context.shapes.?.resolve(a, pending.entries.items, id)) orelse return error.UnsupportedBatchCharacterResource;
        changed = true;
    }
    if (!changed) return;
    if (batch) |context| {
        context.changed = true;
    } else {
        const verified = try pending.write(a, original_info, version, original_count, limit);
        defer a.free(verified);
        const entries = try pending.entries.toOwnedSlice(a);
        a.free(document.character_resources);
        document.character_resources = entries;
    }
    std.mem.swap(model.Paragraph, target, &paragraph);
}
