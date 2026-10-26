//! Property edits preserve each selected run's original resource provenance.
const std = @import("std");
const editor = @import("editor_session.zig");
const Patch = @import("../model/document.zig").CharacterPropertyPatch;

pub fn apply(session: *editor.Session, section: usize, paragraph: usize, start: u32, end: u32, patch: Patch) !bool {
    return applyMode(session, section, paragraph, start, end, patch, true);
}

/// 호출자가 전체 묶음 rollback과 게시 전 저장 검증을 반드시 수행합니다.
pub fn applyDeferredSave(session: *editor.Session, section: usize, paragraph: usize, start: u32, end: u32, patch: Patch) !bool {
    return applyMode(session, section, paragraph, start, end, patch, false);
}

fn applyMode(session: *editor.Session, section: usize, paragraph: usize, start: u32, end: u32, patch: Patch, validate_save: bool) !bool {
    try @import("../model/character_properties.zig").validate(patch);
    if (patch.outline_kind) |kind| _ = try @import("character_outline_kind.zig").token(kind);
    const a = session.allocator;
    const spans = try @import("character_style_snapshot.zig").read(session, section, paragraph);
    defer a.free(spans);
    if (spans.len == 0) return error.InvalidTextPosition;
    const validation_id = spans[0].char_shape_id orelse return error.InvalidCharacterShapeReference;
    try @import("character_style_session.zig").validate(session, section, paragraph, start, end, validation_id);
    if (start == end or (patch.strike_color == null and patch.outline_kind == null and !@import("../model/character_properties.zig").hasEffects(patch) and patch.shade == null and patch.strike_enabled == null and patch.size == null and patch.bold == null and patch.italic == null and patch.underline_kind == null and patch.underline_color == null and patch.text_color == null and patch.font_ids == null)) return false;
    const shapes = try @import("character_style_resources.zig").displayShapes(session);
    defer a.free(shapes);
    var document = try @import("package.zig").inspectDocument(a, session.source, .{});
    defer document.deinit(a);
    if (patch.font_ids) |ids| {
        var fonts = try document.inspectFontReferences(a, .{});
        defer fonts.deinit(a);
        for (ids, 0..) |id, language| if (id) |value| {
            const original = std.mem.indexOfScalar(u32, fonts.faces.tables[language].ids.items, value) != null;
            const created = for (session.font_resources.entries.items) |font| {
                if (@backingInt(font.language) == language and font.id == value) break true;
            } else false;
            if (!original and !created) return error.InvalidFontId;
        };
    }
    var resources = try document.inspectHeaderResources(a, .{});
    defer resources.deinit(a);
    var underline_tree: ?@import("xml_part_tree.zig").Tree = if (patch.underline_kind != null or patch.strike_enabled != null or patch.strike_color != null) try document.readHeaderTree(a, .{}) else null;
    defer if (underline_tree) |*tree| tree.deinit(a);
    const underlines = @import("character_underline_snapshot.zig");
    const color_rows: ?[]underlines.FullRow = if (patch.underline_color != null) try underlines.readFull(session) else null;
    defer if (color_rows) |rows| underlines.deinit(a, rows);
    var ids: std.ArrayList(u32) = .empty;
    defer ids.deinit(a);
    try ids.appendSlice(a, resources.table(.char_shape).ids.items);
    for (session.character_resources.entries.items) |entry| try ids.append(a, entry.id);
    var before = try @import("editor_checkpoint.zig").capture(session, std.math.maxInt(usize));
    defer before.deinit();
    errdefer before.rollback(session) catch unreachable;
    var changed = false;
    for (spans) |span| {
        const low = @max(span.start_unit, start);
        const high = @min(span.end_unit, end);
        if (low >= high) continue;
        const current_id = span.char_shape_id orelse return error.InvalidCharacterShapeReference;
        const shape = block: {
            for (shapes) |value| if (value.id == current_id) break :block value;
            return error.InvalidCharacterShapeReference;
        };
        if ((patch.strike_color == null or patch.strike_color.? == try @import("character_strike_color_current.zig").read(session, &underline_tree.?, current_id)) and @import("character_outline_display.zig").matches(shape.outline, patch.outline_kind) and @import("../model/character_properties.zig").effectsMatch(patch, shape.effects) and (patch.strike_enabled == null or patch.strike_enabled.? == try @import("character_strike_current.zig").read(session, &underline_tree.?, current_id)) and
            (patch.size == null or patch.size.? == (shape.height orelse 1000)) and
            (patch.bold == null or patch.bold.? == shape.bold) and
            (patch.italic == null or patch.italic.? == shape.italic) and
            (patch.text_color == null or patch.text_color.? == shape.text_color) and
            (patch.shade == null or std.meta.eql(shape.shade, @as(?@import("../model/shade_color.zig").Value, @import("../model/shade_color.zig").hwp5(try @import("../model/shade_color.zig").encodeHwp5(patch.shade.?))))) and
            (patch.font_ids == null or @import("../model/character_fonts.zig").matches(shape.font_ids orelse @as(@import("../model/character_fonts.zig").Values, @splat(null)), patch.font_ids.?)) and
            (patch.underline_kind == null or patch.underline_kind.? == try @import("character_underline_current.zig").read(session, &underline_tree.?, current_id)) and
            (patch.underline_color == null or patch.underline_color.? == currentColor(color_rows.?, current_id))) continue;
        var source_id = current_id;
        var merged: Patch = .{};
        for (session.character_resources.entries.items) |entry| if (entry.id == current_id) {
            source_id = entry.source_id;
            merged = entry.properties;
            break;
        };
        merged = @import("../model/character_properties.zig").merge(merged, patch);
        const id = try session.character_resources.add(a, resources.table(.char_shape).ids.items, source_id, merged);
        if (std.mem.indexOfScalar(u32, ids.items, id) == null) try ids.append(a, id);
        changed = (try @import("character_style_session.zig").applyInTransaction(session, section, paragraph, std.math.cast(u32, low) orelse return error.InvalidTextPosition, std.math.cast(u32, high) orelse return error.InvalidTextPosition, id, ids.items)) or changed;
    }
    if (changed and validate_save) {
        const output = try session.save();
        a.free(output);
    }
    return changed;
}
fn currentColor(rows: []const @import("character_underline_snapshot.zig").FullRow, id: u32) ?u32 {
    for (rows) |row| if (row.id == id) return if (row.color) |color| @import("../model/rgb_color.zig").xml(color) else null;
    return null;
}
