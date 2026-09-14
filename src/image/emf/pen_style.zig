pub const Type = enum { cosmetic, geometric };

pub const Value = struct {
    raw: u32,
    line: u4,
    end_cap: u2,
    join: u2,
    pen_type: Type,
};

pub fn parse(raw: u32) !Value {
    if (raw & ~@as(u32, 0x000f330f) != 0) return error.InvalidEmfPenStyleBits;
    const line = raw & 0x0f;
    if (line > 8) return error.UnsupportedEmfPenLineStyle;
    const end_cap = (raw >> 8) & 0x0f;
    if (end_cap > 2) return error.UnsupportedEmfPenEndCap;
    const join = (raw >> 12) & 0x0f;
    if (join > 2) return error.UnsupportedEmfPenJoin;
    const type_bits = (raw >> 16) & 0x0f;
    if (type_bits > 1) return error.UnsupportedEmfPenType;
    if (line == 8 and type_bits != 0) return error.InvalidEmfAlternatePenType;
    return .{
        .raw = raw,
        .line = @intCast(line),
        .end_cap = @intCast(end_cap),
        .join = @intCast(join),
        .pen_type = if (type_bits == 0) .cosmetic else .geometric,
    };
}

test "pen style splits every documented component" {
    const value = try parse(0x00012107);
    try @import("std").testing.expectEqual(@as(u4, 7), value.line);
    try @import("std").testing.expectEqual(@as(u2, 1), value.end_cap);
    try @import("std").testing.expectEqual(@as(u2, 2), value.join);
    try @import("std").testing.expectEqual(Type.geometric, value.pen_type);
}

test "pen style rejects gaps unknown bits and geometric alternate" {
    const testing = @import("std").testing;
    try testing.expectError(error.UnsupportedEmfPenLineStyle, parse(9));
    try testing.expectError(error.InvalidEmfPenStyleBits, parse(0x10));
    try testing.expectError(error.UnsupportedEmfPenEndCap, parse(0x300));
    try testing.expectError(error.UnsupportedEmfPenJoin, parse(0x3000));
    try testing.expectError(error.UnsupportedEmfPenType, parse(0x20000));
    try testing.expectError(error.InvalidEmfAlternatePenType, parse(0x10008));
}
