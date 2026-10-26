//! Allocation-free value comparison, including null/empty and float bit patterns.
const std = @import("std");
const model = @import("document.zig");
pub fn paragraph(left: model.Paragraph, right: model.Paragraph) bool {
    return equal(model.Paragraph, left, right);
}

/// Shared deep semantic comparison for adapter-owned values without unions.
pub fn semantic(comptime T: type, left: T, right: T) bool {
    return equal(T, left, right);
}

pub fn document(left: model.Document, right: model.Document) bool {
    inline for (@import("../reflection.zig").fields(model.Document)) |field| {
        if (comptime std.mem.eql(u8, field.name, "font_resources")) {
            if (!equal([]@import("font_face_value.zig").Value, left.font_resources.entries.items, right.font_resources.entries.items)) return false;
        } else if (!equal(field.type, @field(left, field.name), @field(right, field.name))) return false;
    }
    return true;
}

fn equal(comptime T: type, left: T, right: T) bool {
    if (T == @import("shade_color.zig").Intent) return std.meta.eql(left, right);
    return switch (@typeInfo(T)) {
        .@"struct" => result: {
            inline for (@import("../reflection.zig").fields(T)) |field| {
                if (!equal(field.type, @field(left, field.name), @field(right, field.name))) break :result false;
            }
            break :result true;
        },
        .optional => |info| if (left) |value| (if (right) |other| equal(info.child, value, other) else false) else right == null,
        .array => |info| result: {
            for (left, right) |value, other| if (!equal(info.child, value, other)) break :result false;
            break :result true;
        },
        .pointer => |info| result: {
            if (info.size != .slice) @compileError("Model equality requires owned slices, not pointer identity");
            if (left.len != right.len) break :result false;
            if (info.child == u8) break :result std.mem.eql(u8, left, right);
            for (left, right) |value, other| if (!equal(info.child, value, other)) break :result false;
            break :result true;
        },
        .float => @as(@Int(.unsigned, @bitSizeOf(T)), @bitCast(left)) == @as(@Int(.unsigned, @bitSizeOf(T)), @bitCast(right)),
        .int, .bool, .@"enum" => left == right,
        else => @compileError("Unreviewed model field type in value equality"),
    };
}

test "model equality distinguishes absent shade none white and color" {
    const Patch = model.CharacterPropertyPatch;
    try std.testing.expect(!equal(Patch, .{}, .{ .shade = .none }));
    try std.testing.expect(!equal(Patch, .{ .shade = .none }, .{ .shade = .{ .color = 0xffffff } }));
    try std.testing.expect(equal(Patch, .{ .shade = .{ .color = 0 } }, .{ .shade = .{ .color = 0 } }));
    try std.testing.expect(!equal(Patch, .{ .shade = .{ .color = 0 } }, .{ .shade = .{ .color = 1 } }));
}

test "model equality distinguishes font array language values null and zero" {
    const Values = @import("character_fonts.zig").Values;
    const empty: Values = @splat(null);
    try std.testing.expect(equal(Values, empty, empty));
    for (0..7) |language| {
        var changed = empty;
        changed[language] = 0;
        try std.testing.expect(!equal(Values, empty, changed));
        try std.testing.expect(equal(Values, changed, changed));
    }
}
