//! Canonical straight diagonals and the observed HWP5 direction-bit codec.
//! Curved/rotated/center/reserved geometry is retained as unknown, never flattened.
pub const Directions = enum { none, rising, falling, cross };
pub const hwp5_direction_mask: u16 = 0x00fc;
pub const hwp5_geometry_modifier_mask: u16 = 0xff00;

pub fn fromHwp5(attributes: u16) ?Directions {
    if (attributes & hwp5_geometry_modifier_mask != 0) return null;
    const rising = (attributes >> 2) & 7;
    const falling = (attributes >> 5) & 7;
    if ((rising != 0 and rising != 2) or (falling != 0 and falling != 2)) return null;
    return if (rising == 2) (if (falling == 2) .cross else .rising) else (if (falling == 2) .falling else .none);
}

pub fn hwp5Bits(directions: Directions) u16 {
    return switch (directions) {
        .none => 0,
        .rising => 0x0008,
        .falling => 0x0040,
        .cross => 0x0048,
    };
}

pub fn writeHwp5(attributes: u16, directions: Directions) !u16 {
    if (fromHwp5(attributes) == null) return error.UnsupportedHwp5DiagonalDirections;
    // 3D/shadow and every bit outside the direction mask remain byte-exact.
    return (attributes & ~hwp5_direction_mask) | hwp5Bits(directions);
}
