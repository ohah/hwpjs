const Flags = @import("character_effect_flags.zig").Flags;
pub const Row = struct { id: u32, emboss: bool, engrave: bool, superscript: bool, subscript: bool };
pub fn row(id: u32, flags: Flags) Row {
    return .{ .id = id, .emboss = flags.emboss, .engrave = flags.engrave, .superscript = flags.superscript, .subscript = flags.subscript };
}
