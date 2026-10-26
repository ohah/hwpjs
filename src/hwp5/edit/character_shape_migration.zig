//! Materialize an explicit 5.0.3.0 character shape, never a container upgrade.
const std = @import("std");
const Version = @import("../version.zig").Version;
const Shape = @import("../docinfo/char_shape.zig").CharShape;
pub const Defaults = struct { border_fill_id: ?u16 = null, inactive_strike_color: ?u32 = null };

pub fn prepare(a: std.mem.Allocator, input: []const u8, from: Version, to: Version, defaults: Defaults, limit: usize) ![]u8 {
    if (to.raw != 0x05000300 or from.raw > to.raw) return error.UnsupportedDecorationMigrationTarget;
    const shape = try Shape.parse(input, from);
    if (shape.extra.len != 0 or shape.unresolved_tail != null) return error.UnsupportedCharacterMigrationTail;
    if (@import("character_decoration_compat.zig").legacyStrike(shape.underlineKindRaw(), shape.strikeKindRaw()))
        return @import("legacy_decoration_migration.zig").prepare(a, input, from, to, if (shape.border_fill_id == null) defaults.border_fill_id else null, limit);
    const border = shape.border_fill_id orelse defaults.border_fill_id orelse return error.MissingCharacterMigrationDefault;
    const color = shape.strike_color orelse blk: {
        if (shape.strikeKindRaw() != 0) return error.UnsupportedActiveCharacterStrikeMigration;
        break :blk defaults.inactive_strike_color orelse return error.MissingCharacterMigrationDefault;
    };
    if (Shape.independent_strike_size > limit) return error.LimitExceeded;
    const output = try a.alloc(u8, Shape.independent_strike_size);
    @memcpy(output[0..Shape.base_size], input[0..Shape.base_size]);
    std.mem.writeInt(u16, output[Shape.border_fill_offset..][0..2], border, .little);
    std.mem.writeInt(u32, output[Shape.strike_color_offset..][0..4], color, .little);
    return output;
}
