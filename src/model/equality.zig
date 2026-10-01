//! Allocation-free value comparison, including null/empty and float bit patterns.
const std = @import("std");
const model = @import("document.zig");

pub fn document(left: model.Document, right: model.Document) bool {
    return equal(model.Document, left, right);
}

fn equal(comptime T: type, left: T, right: T) bool {
    return switch (@typeInfo(T)) {
        .@"struct" => result: {
            inline for (std.meta.fields(T)) |field| {
                if (!equal(field.type, @field(left, field.name), @field(right, field.name))) break :result false;
            }
            break :result true;
        },
        .optional => |info| if (left) |value| (if (right) |other| equal(info.child, value, other) else false) else right == null,
        .pointer => |info| result: {
            if (info.size != .slice) @compileError("Model equality requires owned slices, not pointer identity");
            if (left.len != right.len) break :result false;
            if (info.child == u8) break :result std.mem.eql(u8, left, right);
            for (left, right) |value, other| if (!equal(info.child, value, other)) break :result false;
            break :result true;
        },
        .float => @as(std.meta.Int(.unsigned, @bitSizeOf(T)), @bitCast(left)) == @as(std.meta.Int(.unsigned, @bitSizeOf(T)), @bitCast(right)),
        .int, .bool, .@"enum" => left == right,
        else => @compileError("Unreviewed model field type in value equality"),
    };
}
