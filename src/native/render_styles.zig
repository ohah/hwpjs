const std = @import("std");
const Session = @import("../hwp5/edit/style_preservation.zig").Session;
// Canonical row marshalling copied from wasm/hwp5_edit.zig; Native session SSOT.
pub fn character_font_metrics(a: std.mem.Allocator, s: *const Session) ![]u8 {
    const shapes = try s.characterShapes(a);
    defer a.free(shapes);
    return try @import("../hwp5/edit/character_font_metrics.zig").encode(a, shapes);
}
pub fn character_text_colors(a: std.mem.Allocator, s: *const Session) ![]u8 {
    const shapes = try s.characterShapes(a);
    defer a.free(shapes);
    const Row = @import("../model/character_color_snapshot.zig").Row;
    const rows = try a.alloc(Row, shapes.len);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| row.* = .{ .id = shape.id, .color = if (shape.text_color_raw <= 0xffffff) @import("../model/rgb_color.zig").hwp5(shape.text_color_raw) else null };
    return try std.json.Stringify.valueAlloc(a, rows, .{});
}
pub fn character_shades(a: std.mem.Allocator, s: *const Session) ![]u8 {
    const shapes = try s.characterShapes(a);
    defer a.free(shapes);
    const snapshot = @import("../model/character_shade_snapshot.zig");
    const rows = try a.alloc(snapshot.Row, shapes.len);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| row.* = snapshot.row(shape.id, @import("../model/shade_color.zig").hwp5(shape.shade_color_raw));
    return try std.json.Stringify.valueAlloc(a, rows, .{});
}
pub fn character_effects(a: std.mem.Allocator, s: *const Session) ![]u8 {
    const shapes = try s.characterShapes(a);
    defer a.free(shapes);
    const snapshot = @import("../model/character_effect_snapshot.zig");
    const rows = try a.alloc(snapshot.Row, shapes.len);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| row.* = snapshot.row(shape.id, shape.effects);
    return try std.json.Stringify.valueAlloc(a, rows, .{});
}
pub fn character_outlines(a: std.mem.Allocator, s: *const Session) ![]u8 {
    const shapes = try s.characterShapes(a);
    defer a.free(shapes);
    const Row = @import("../model/character_outline_snapshot.zig").Row;
    const rows = try a.alloc(Row, shapes.len);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| row.* = .{ .id = shape.id, .state = switch (shape.outline_kind_raw) {
        0 => .none,
        1 => .solid,
        7 => .unknown,
        else => .other,
    }, .rawKind = shape.outline_kind_raw };
    return try std.json.Stringify.valueAlloc(a, rows, .{});
}
pub fn character_font_references(a: std.mem.Allocator, s: *const Session) ![]u8 {
    const shapes = try s.characterShapes(a);
    defer a.free(shapes);
    const Row = struct { id: u32, fontIds: ?@import("../model/character_fonts.zig").Values };
    const rows = try a.alloc(Row, shapes.len);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| {
        var ids: @import("../model/character_fonts.zig").Values = @splat(null);
        for (shape.font_ids, 0..) |id, language| ids[language] = id;
        row.* = .{ .id = shape.id, .fontIds = ids };
    }
    return try std.json.Stringify.valueAlloc(a, rows, .{});
}
pub fn font_face_metadata(a: std.mem.Allocator, s: *const Session) ![]u8 {
    const rows = try s.fontFaceMetadata(a);
    defer {
        for (rows) |*row| row.deinit(a);
        a.free(rows);
    }
    return try std.json.Stringify.valueAlloc(a, .{ .version = @as(u32, 1), .fonts = rows }, .{});
}
pub fn character_strike_styles(a: std.mem.Allocator, s: *const Session) ![]u8 {
    const shapes = try s.characterShapes(a);
    defer a.free(shapes);
    const Row = @import("../model/character_strike_snapshot.zig").StyleRow;
    const rows = try a.alloc(Row, shapes.len);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| {
        const effective = @import("../hwp5/edit/character_decoration_compat.zig").resolve(shape);
        row.* = .{ .id = shape.id, .raw_style = effective.strike_style, .raw_color = effective.strike_color };
    }
    return try std.json.Stringify.valueAlloc(a, rows, .{});
}
pub fn character_strikes(a: std.mem.Allocator, s: *const Session) ![]u8 {
    const shapes = try s.characterShapes(a);
    defer a.free(shapes);
    const Row = @import("../model/character_strike_snapshot.zig").Row;
    const rows = try a.alloc(Row, shapes.len);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| row.* = .{ .id = shape.id, .enabled = @import("../hwp5/edit/character_decoration_compat.zig").resolve(shape).strike_enabled };
    return try std.json.Stringify.valueAlloc(a, rows, .{});
}
pub fn character_underlines(a: std.mem.Allocator, s: *const Session) ![]u8 {
    const shapes = try s.characterShapes(a);
    defer a.free(shapes);
    const Row = @import("../model/character_underline_snapshot.zig").Row;
    const rows = try a.alloc(Row, shapes.len);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| row.* = .{ .id = shape.id, .kind = switch (@import("../hwp5/edit/character_decoration_compat.zig").resolve(shape).underline_kind) {
        0 => .none,
        1 => .bottom,
        3 => .top,
        2 => null,
    } };
    return try std.json.Stringify.valueAlloc(a, rows, .{});
}
pub fn character_underline_styles(a: std.mem.Allocator, s: *const Session) ![]u8 {
    const shapes = try s.characterShapes(a);
    defer a.free(shapes);
    const Row = @import("../model/character_underline_snapshot.zig").StyleRow;
    const rows = try a.alloc(Row, shapes.len);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| row.* = .{ .id = shape.id, .raw_style = shape.underline_style_raw, .raw_color = shape.underline_color_raw };
    return try std.json.Stringify.valueAlloc(a, rows, .{});
}
