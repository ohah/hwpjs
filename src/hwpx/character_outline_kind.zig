//! Only verified XML outline intents; never infer tokens from binary codes.
pub fn token(kind: @import("../model/character_outline_kind.zig").Kind) ![]const u8 {
    return switch (kind) {
        .none => "NONE",
        .solid => "SOLID",
        else => error.UnsupportedCharacterOutlineKind,
    };
}
