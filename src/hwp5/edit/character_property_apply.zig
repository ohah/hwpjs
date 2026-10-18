//! Atomic property painting preserves each selected run's other properties.
const std = @import("std");
const model = @import("../../model/document.zig");
const Values = @import("character_resource_values.zig").Values;
pub const Edit = struct { section: usize, paragraph: usize, start_unit: u32, end_unit: u32, properties: model.CharacterPropertyPatch };
pub fn apply(a: std.mem.Allocator, source: []const u8, original_info: []const u8, version: @import("../version.zig").Version, document: *model.Document, edit: Edit, original_count: usize, limit: usize) !void {
    try @import("character_property_payload.zig").validate(edit.properties);
    if (edit.properties.font_ids) |ids| {
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
    if (edit.section >= document.sections.len) return error.InvalidSection;
    if (edit.paragraph >= document.sections[edit.section].paragraphs.len) return error.InvalidParagraph;
    const target = &document.sections[edit.section].paragraphs[edit.paragraph];
    const count = original_count + document.character_resources.len;
    _ = try @import("plain_text_source.zig").validateCharacterFormat(a, source, version, target.*, count);
    const text = try @import("plain_text_content.zig").editableTextBytes(a, target.*);
    defer a.free(text);
    try @import("control_boundaries.zig").validateRetainedText(text);
    try @import("control_boundaries.zig").validate(text, edit.start_unit, edit.end_unit);
    try @import("character_runs.zig").validate(target.character_runs, text, count);
    if (edit.start_unit == edit.end_unit) return;
    const borrowed: Values = .{ .entries = .{ .items = document.character_resources, .capacity = document.character_resources.len, .pointer_stability = .{} } };
    const current = try borrowed.write(a, original_info, version, original_count, limit);
    defer a.free(current);
    const shapes = try @import("character_display_shapes.zig").read(a, current, version, count);
    defer a.free(shapes);
    var pending = try borrowed.clone(a);
    defer pending.deinit(a);
    var paragraph = try @import("../../model/clone.zig").paragraph(a, target.*);
    defer paragraph.deinit(a);
    var changed = false;
    for (target.character_runs, 0..) |run, index| {
        const end = if (index + 1 < target.character_runs.len) target.character_runs[index + 1].start_unit else target.declared_units;
        const start = @max(run.start_unit, edit.start_unit);
        const stop = @min(end, edit.end_unit);
        if (start >= stop) continue;
        const shape = shapes[run.char_shape_id];
        if ((edit.properties.outline_kind == null or shape.outline_kind_raw == @import("character_outline_kind.zig").raw(edit.properties.outline_kind.?)) and @import("../../model/character_properties.zig").effectsMatch(edit.properties, shape.effects) and (edit.properties.shade == null or try @import("../../model/shade_color.zig").encodeHwp5(edit.properties.shade.?) == shape.shade_color_raw))
            if ((edit.properties.strike_enabled == null or (shape.strike_kind_raw <= 1 and edit.properties.strike_enabled.? == (shape.strike_kind_raw == 1))) and (edit.properties.size == null or edit.properties.size.? == shape.height) and (edit.properties.bold == null or edit.properties.bold.? == shape.bold) and (edit.properties.italic == null or edit.properties.italic.? == shape.italic) and (edit.properties.underline_kind == null or @backingInt(edit.properties.underline_kind.?) == shape.underline_kind_raw) and (edit.properties.underline_color == null or @import("../../model/rgb_color.zig").hwp5(edit.properties.underline_color.?) == shape.underline_color_raw) and (edit.properties.text_color == null or @import("../../model/rgb_color.zig").hwp5(edit.properties.text_color.?) == shape.text_color_raw) and (edit.properties.font_ids == null or @import("../../model/character_fonts.zig").matches(@import("../../model/character_fonts.zig").fromHwp5(shape.font_ids), edit.properties.font_ids.?))) continue;
        var source_id = run.char_shape_id;
        var properties: model.CharacterPropertyPatch = .{};
        if (source_id >= original_count) {
            const intent = document.character_resources[source_id - original_count];
            source_id = intent.source_id;
            properties = intent.properties;
        }
        properties = @import("../../model/character_properties.zig").merge(properties, edit.properties);
        const id = try pending.add(a, original_count, source_id, properties);
        try @import("character_format.zig").apply(a, source, version, &paragraph, .{ .section = edit.section, .paragraph = edit.paragraph, .start_unit = start, .end_unit = stop, .char_shape_id = id }, original_count + pending.entries.items.len);
        changed = true;
    }
    if (!changed) return;
    const verified = try pending.write(a, original_info, version, original_count, limit);
    defer a.free(verified);
    const entries = try pending.entries.toOwnedSlice(a);
    a.free(document.character_resources);
    document.character_resources = entries;
    std.mem.swap(model.Paragraph, target, &paragraph);
}
