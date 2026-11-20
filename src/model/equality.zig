//! Allocation-free value comparison, including null/empty and float bit patterns.
const std = @import("std");
const model = @import("document.zig");
pub fn paragraph(left: model.Paragraph, right: model.Paragraph) bool {
    return equal(model.Paragraph, left, right);
}

/// Shared deep semantic comparison; tagged unions require an explicit reviewed branch.
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
    if (T == @import("border_fill_patch.zig").Background) return std.meta.eql(left, right);
    // Only this reviewed canonical owner is admitted. Different ownership tags
    // remain distinct; explicit runs compare their values, never slice identity.
    if (T == @import("authored_paragraph.zig").Styles) return switch (left) {
        .inherit => right == .inherit,
        .runs => |rows| if (right == .runs) equal([]@import("authored_paragraph.zig").Run, rows, right.runs) else false,
    };
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

test "generated cell rich model equality distinguishes inherited ownership and deep run values" {
    const Paragraph = @import("authored_paragraph.zig");
    const a = std.testing.allocator;
    const left = try a.dupe(Paragraph.Run, &.{ .{ .start_unit = 0, .char_shape_id = 0 }, .{ .start_unit = 2, .char_shape_id = 7 } });
    defer a.free(left);
    const right = try a.dupe(Paragraph.Run, left);
    defer a.free(right);
    try std.testing.expect(equal(Paragraph.Styles, .inherit, .inherit));
    try std.testing.expect(!equal(Paragraph.Styles, .inherit, .{ .runs = left }));
    try std.testing.expect(!equal(Paragraph.Styles, .{ .runs = left }, .inherit));
    try std.testing.expect(equal(Paragraph.Styles, .{ .runs = left }, .{ .runs = right }));
    right[1].char_shape_id = 8;
    try std.testing.expect(!equal(Paragraph.Styles, .{ .runs = left }, .{ .runs = right }));
    right[1] = left[1];
    right[1].start_unit = 3;
    try std.testing.expect(!equal(Paragraph.Styles, .{ .runs = left }, .{ .runs = right }));
    try std.testing.expect(!equal(Paragraph.Styles, .{ .runs = left }, .{ .runs = right[0..1] }));
}
