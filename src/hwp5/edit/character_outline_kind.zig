//! HWP5 table35 mapping, independent of XML enum ordinals.
pub fn raw(kind: @import("../../model/character_outline_kind.zig").Kind) u3 {
    return switch (kind) {
        .none => 0,
        .solid => 1,
        .dot => 2,
        .thick => 3,
        .dash => 4,
        .dash_dot => 5,
        .dash_dot_dot => 6,
    };
}
