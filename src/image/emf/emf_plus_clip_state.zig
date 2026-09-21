const std = @import("std");
const combine_mode = @import("emf_plus_combine_mode.zig");
const geometry = @import("emf_plus_geometry.zig");

pub const State = enum {
    infinite,
    empty,
    complex,

    pub fn combineRectangle(self: State, mode: combine_mode.CombineMode, rectangle: geometry.RectF) State {
        _ = rectangle;
        return self.combineOpaque(mode);
    }

    pub fn combineOpaque(self: State, mode: combine_mode.CombineMode) State {
        return switch (mode) {
            .replace => .complex,
            .intersect => if (self == .empty) .empty else .complex,
            .union_mode => if (self == .infinite) .infinite else .complex,
            .xor => .complex,
            .exclude => if (self == .empty) .empty else .complex,
            .complement => if (self == .infinite) .empty else .complex,
        };
    }

    pub fn offset(self: State, dx: f32, dy: f32) State {
        _ = dx;
        _ = dy;
        return self;
    }
};

test "EMF+ clip state keeps only proven identities for every CombineMode" {
    const rectangle: geometry.RectF = .{ .x = 1, .y = 2, .width = 3, .height = 4 };
    try std.testing.expectEqual(State.complex, State.infinite.combineRectangle(.replace, rectangle));
    try std.testing.expectEqual(State.complex, State.infinite.combineRectangle(.intersect, rectangle));
    try std.testing.expectEqual(State.infinite, State.infinite.combineRectangle(.union_mode, rectangle));
    try std.testing.expectEqual(State.complex, State.infinite.combineRectangle(.xor, rectangle));
    try std.testing.expectEqual(State.complex, State.infinite.combineRectangle(.exclude, rectangle));
    try std.testing.expectEqual(State.empty, State.infinite.combineRectangle(.complement, rectangle));

    try std.testing.expectEqual(State.complex, State.empty.combineRectangle(.replace, rectangle));
    try std.testing.expectEqual(State.empty, State.empty.combineRectangle(.intersect, rectangle));
    try std.testing.expectEqual(State.complex, State.empty.combineRectangle(.union_mode, rectangle));
    try std.testing.expectEqual(State.complex, State.empty.combineRectangle(.xor, rectangle));
    try std.testing.expectEqual(State.empty, State.empty.combineRectangle(.exclude, rectangle));
    try std.testing.expectEqual(State.complex, State.empty.combineRectangle(.complement, rectangle));
}

test "EMF+ clip state applies the same safe identities to opaque operands" {
    try std.testing.expectEqual(State.complex, State.infinite.combineOpaque(.replace));
    try std.testing.expectEqual(State.empty, State.empty.combineOpaque(.intersect));
    try std.testing.expectEqual(State.infinite, State.infinite.combineOpaque(.union_mode));
    try std.testing.expectEqual(State.complex, State.empty.combineOpaque(.xor));
    try std.testing.expectEqual(State.empty, State.empty.combineOpaque(.exclude));
    try std.testing.expectEqual(State.empty, State.infinite.combineOpaque(.complement));
}

test "EMF+ clip state translation preserves only the abstract region class" {
    try std.testing.expectEqual(State.infinite, State.infinite.offset(std.math.nan(f32), std.math.inf(f32)));
    try std.testing.expectEqual(State.empty, State.empty.offset(1, 2));
    try std.testing.expectEqual(State.complex, State.complex.offset(-3, 4));
}
