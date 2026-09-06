const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
/// Float fields retain wire bits; signed selectors are not coerced into enums/bools.
pub const Shadow = struct {
    style: i32,
    transparency_bits: u32,
    blur_bits: u32,
    direction_bits: u32,
    distance_bits: u32,
    alignment: i32,
    skew_x_bits: u32,
    skew_y_bits: u32,
    scale_x_bits: u32,
    scale_y_bits: u32,
    rotate_with_shape: i32,
};
pub const Neon = struct { transparency_bits: u32, radius_bits: u32 };
/// Table 112 lists fourteen four-byte fields (56), despite its total of 53.
pub const Reflection = struct {
    style: i32,
    radius_bits: u32,
    direction_bits: u32,
    distance_bits: u32,
    skew_x_bits: u32,
    skew_y_bits: u32,
    scale_x_bits: u32,
    scale_y_bits: u32,
    rotation_style: i32,
    start_transparency_bits: u32,
    start_position_bits: u32,
    end_transparency_bits: u32,
    end_position_bits: u32,
    offset_direction_bits: u32,
};
pub fn read(comptime T: type, reader: *Reader) !T {
    if (T != Shadow and T != Neon and T != Reflection) @compileError("not a picture effect field block");
    var r = reader.*;
    var value: T = undefined;
    inline for (std.meta.fields(T)) |f| @field(value, f.name) = try r.readInt(f.type);
    reader.* = r;
    return value;
}
