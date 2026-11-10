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
    return applyInternal(a, source, original_info, version, document, edit, original_count, limit, batch, null, if (testing) null else {});
}
const testing = @import("builtin").is_test;
const Range = @import("../../model/formatting_patch.zig").Range;
pub const Work = if (testing) struct {
    paragraphs: usize = 0,
    materialized_bytes: usize = 0,
    validated_runs: usize = 0,
    run_rows: usize = 0,
    range_rows: usize = 0,
    range_advances: usize = 0,
    intersections: usize = 0,
    resource_lookups: usize = 0,
    output_rows: usize = 0,
    controls: usize = 0,
    font_names: usize = 0,
    unselected_sections: usize = 0,
} else void;
const Measure = if (testing) ?*Work else void;
pub const GroupEdit = struct { section: usize, paragraph: usize, ranges: []const Range, insertion: @import("../../model/formatting_patch.zig").Patch };
fn tick(work: Measure, comptime field: []const u8, count: usize) void {
    if (testing) if (work) |w| {
        @field(w, field) += count;
    };
}
pub fn applyGrouped(a: std.mem.Allocator, source: []const u8, original_info: []const u8, version: @import("../version.zig").Version, document: *model.Document, section: usize, paragraph: usize, properties: model.CharacterPropertyPatch, ranges: []const Range, original_count: usize, limit: usize, batch: *Context, work: Measure) !void {
    if (ranges.len == 0) return error.EmptyCharacterSelection;
    return applyInternal(a, source, original_info, version, document, .{ .section = section, .paragraph = paragraph, .start_unit = ranges[0].startUnit, .end_unit = ranges[ranges.len - 1].endUnit, .properties = properties }, original_count, limit, batch, ranges, work);
}
fn applyInternal(a: std.mem.Allocator, source: []const u8, original_info: []const u8, version: @import("../version.zig").Version, document: *model.Document, edit: Edit, original_count: usize, limit: usize, batch: ?*Context, grouped: ?[]const Range, work: Measure) !void {
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
            return applyInternal(a, source, original_info, version, document, edit, original_count, limit, null, grouped, work);
        }
    }
    const resources = if (batch) |context| context.entries(document) else document.character_resources;
    try validateFontIds(a, original_info, version, document, edit.properties, batch);
    if (edit.section >= document.sections.len) return error.InvalidSection;
    if (edit.paragraph >= document.sections[edit.section].paragraphs.len) return error.InvalidParagraph;
    const target = &document.sections[edit.section].paragraphs[edit.paragraph];
    const count = original_count + resources.len;
    const source_context = if (batch) |context| block: {
        const slot = try context.source_contexts.getOrPut(a, edit.section);
        if (!slot.found_existing) slot.value_ptr.* = .{ .source = source, .version = version };
        break :block slot.value_ptr;
    } else null;
    const validated = if (source_context) |context|
        try @import("plain_text_source.zig").validateCharacterFormatScoped(a, context, source, version, target.*, count)
    else
        try @import("plain_text_source.zig").validateCharacterFormat(a, source, version, target.*, count);
    const text = try @import("plain_text_content.zig").editableTextBytes(a, target.*);
    defer a.free(text);
    const controls = @import("control_boundaries.zig");
    try controls.validateRetainedText(text);
    if (grouped) |ranges| {
        var previous: u32 = 0;
        for (ranges) |range| {
            tick(work, "range_rows", 1);
            if (range.startUnit < previous or range.startUnit >= range.endUnit) return error.InvalidTextPosition;
            previous = range.endUnit;
        }
        const visited = try controls.validateFormattingRanges(text, ranges);
        if (testing) tick(work, "controls", visited);
    } else try controls.validate(text, edit.start_unit, edit.end_unit);
    try @import("character_runs.zig").validate(target.character_runs, text, count);
    tick(work, "paragraphs", 1);
    tick(work, "materialized_bytes", text.len);
    tick(work, "validated_runs", target.character_runs.len);
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
    if (grouped) |ranges| {
        const output = (try paintGrouped(a, version, target.*, ranges, edit.properties, original_count, current_owned, shapes_owned, pending, batch, work)) orelse return;
        errdefer a.free(output);
        const tags = try @import("character_format.zig").prepareRanges(a, target.*, validated.ranges, text);
        errdefer a.free(tags);
        try installResources(a, original_info, version, document, original_count, limit, pending, batch);
        a.free(target.character_runs);
        if (target.range_tags) |old| a.free(old);
        target.character_runs = output;
        target.range_tags = tags;
        target.deferred_direct_records = validated.preserved_direct_records;
        return;
    }
    var paragraph = try @import("../../model/clone.zig").paragraph(a, target.*);
    defer paragraph.deinit(a);
    var changed = false;
    for (target.character_runs, 0..) |run, index| {
        const end = if (index + 1 < target.character_runs.len) target.character_runs[index + 1].start_unit else target.declared_units;
        const start = @max(run.start_unit, edit.start_unit);
        const stop = @min(end, edit.end_unit);
        if (start >= stop) continue;
        const id = (try patchedId(a, version, original_count, current_owned, shapes_owned, pending, batch, run.char_shape_id, edit.properties)) orelse continue;
        try @import("character_format.zig").applyScoped(a, source, version, &paragraph, .{ .section = edit.section, .paragraph = edit.paragraph, .start_unit = start, .end_unit = stop, .char_shape_id = id }, original_count + pending.entries.items.len, source_context);
        if (batch) |context| _ = (try context.shapes.?.resolve(a, pending.entries.items, id)) orelse return error.UnsupportedBatchCharacterResource;
        changed = true;
    }
    if (!changed) return;
    try installResources(a, original_info, version, document, original_count, limit, pending, batch);
    std.mem.swap(model.Paragraph, target, &paragraph);
}

pub fn validateFontIds(_: std.mem.Allocator, original_info: []const u8, version: @import("../version.zig").Version, document: *const model.Document, properties: model.CharacterPropertyPatch, batch: ?*Context) !void {
    if (properties.font_ids) |ids| {
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
}
fn patchedId(a: std.mem.Allocator, version: @import("../version.zig").Version, original_count: usize, current_owned: ?[]const u8, shapes_owned: ?[]const @import("character_display_shapes.zig").Shape, pending: *Values, batch: ?*Context, run_id: u32, patch: model.CharacterPropertyPatch) !?u32 {
    const shape = if (batch) |context| (try context.shapes.?.resolve(a, pending.entries.items, run_id)) orelse return error.UnsupportedBatchCharacterResource else shapes_owned.?[run_id];
    const border_matches = if (patch.border_fill) |border| try @import("border_fill_character_current.zig").matches(current_owned.?, version, run_id, border) else true;
    const decoration = @import("character_decoration_compat.zig").resolve(shape);
    const strike_color_matches = patch.strike_color == null or (shape.strike_kind_raw <= 1 and decoration.strike_color != null and @import("../../model/rgb_color.zig").hwp5(patch.strike_color.?) == decoration.strike_color.?);
    const extra_matches = (patch.shadow == null or @import("../../model/character_shadow.zig").matches(shape.shadow, patch.shadow.?)) and @import("../../model/character_metric_patch.zig").matches(shape.font_metrics, patch) and
        (patch.underline_style == null or @import("../../model/character_line_style.zig").hwp5(patch.underline_style.?) == shape.underline_style_raw) and
        (patch.strike_style == null or @import("../../model/character_line_style.zig").hwp5(patch.strike_style.?) == decoration.strike_style);
    if (border_matches and extra_matches and strike_color_matches and (patch.outline_kind == null or shape.outline_kind_raw == @import("character_outline_kind.zig").raw(patch.outline_kind.?)) and @import("../../model/character_properties.zig").effectsMatch(patch, shape.effects) and (patch.shade == null or try @import("../../model/shade_color.zig").encodeHwp5(patch.shade.?) == shape.shade_color_raw))
        if ((patch.strike_enabled == null or patch.strike_enabled.? == decoration.strike_enabled) and (patch.size == null or patch.size.? == shape.height) and (patch.bold == null or patch.bold.? == shape.bold) and (patch.italic == null or patch.italic.? == shape.italic) and (patch.underline_kind == null or @backingInt(patch.underline_kind.?) == decoration.underline_kind) and (patch.underline_color == null or @import("../../model/rgb_color.zig").hwp5(patch.underline_color.?) == shape.underline_color_raw) and (patch.text_color == null or @import("../../model/rgb_color.zig").hwp5(patch.text_color.?) == shape.text_color_raw) and (patch.font_ids == null or @import("../../model/character_fonts.zig").matches(@import("../../model/character_fonts.zig").fromHwp5(shape.font_ids), patch.font_ids.?))) return null;
    var source_id = run_id;
    var properties: model.CharacterPropertyPatch = .{};
    if (source_id >= original_count) {
        const intent = pending.entries.items[source_id - original_count];
        source_id = intent.source_id;
        properties = intent.properties;
    }
    const source_shape = if (batch) |context| (try context.shapes.?.resolve(a, pending.entries.items, source_id)) orelse return error.UnsupportedBatchCharacterResource else shapes_owned.?[source_id];
    properties = try @import("character_decoration_patch_merge.zig").merge(source_shape, shape, properties, patch);
    const indexed = if (batch) |context| try pending.addIndexed(a, &context.intent_index, original_count, source_id, properties) else null;
    const id = indexed orelse try pending.add(a, original_count, source_id, properties);
    return id;
}

fn installResources(a: std.mem.Allocator, original_info: []const u8, version: @import("../version.zig").Version, document: *model.Document, original_count: usize, limit: usize, pending: *Values, batch: ?*Context) !void {
    if (batch) |context| {
        context.changed = true;
    } else {
        const verified = try pending.write(a, original_info, version, original_count, limit);
        defer a.free(verified);
        const entries = try pending.entries.toOwnedSlice(a);
        a.free(document.character_resources);
        document.character_resources = entries;
    }
}
/// Each source run is visited once. Intersections of two ordered partitions
/// are linear in their combined sizes. Reuse the resolved resource per old ID.
fn paintGrouped(a: std.mem.Allocator, version: @import("../version.zig").Version, target: model.Paragraph, ranges: []const Range, patch: model.CharacterPropertyPatch, original_count: usize, current_info: ?[]const u8, shapes: ?[]const @import("character_display_shapes.zig").Shape, pending: *Values, batch: ?*Context, work: Measure) !?[]model.CharacterRun {
    const runs = @import("character_runs.zig");
    var out: std.ArrayList(model.CharacterRun) = .empty;
    defer out.deinit(a);
    var resolved: std.AutoHashMapUnmanaged(u32, u32) = .empty;
    defer resolved.deinit(a);
    var range_index: usize = 0;
    var changed = false;
    for (target.character_runs, 0..) |row, index| {
        tick(work, "run_rows", 1);
        var at = row.start_unit;
        const end = if (index + 1 < target.character_runs.len) target.character_runs[index + 1].start_unit else target.declared_units;
        while (range_index < ranges.len and ranges[range_index].endUnit <= at) : (range_index += 1) {
            tick(work, "range_advances", 1);
        }
        while (range_index < ranges.len and ranges[range_index].startUnit < end and at < end) {
            const range = ranges[range_index];
            const start = @max(at, range.startUnit);
            const stop = @min(end, range.endUnit);
            if (at < start) try runs.append(a, &out, at, row.char_shape_id);
            tick(work, "intersections", 1);
            const id = resolved.get(row.char_shape_id) orelse blk: {
                tick(work, "resource_lookups", 1);
                const value = (try patchedId(a, version, original_count, current_info, shapes, pending, batch, row.char_shape_id, patch)) orelse row.char_shape_id;
                if (value != row.char_shape_id) if (batch) |context| {
                    _ = (try context.shapes.?.resolve(a, pending.entries.items, value)) orelse return error.UnsupportedBatchCharacterResource;
                };
                try resolved.put(a, row.char_shape_id, value);
                break :blk value;
            };
            changed = changed or id != row.char_shape_id;
            try runs.append(a, &out, start, id);
            at = stop;
            if (at == range.endUnit) {
                range_index += 1;
                tick(work, "range_advances", 1);
            }
        }
        if (at < end or row.start_unit == end) try runs.append(a, &out, at, row.char_shape_id);
    }
    if (!changed) return null;
    if (out.items.len > 65535) return error.LimitExceeded;
    tick(work, "output_rows", out.items.len);
    return try out.toOwnedSlice(a);
}
