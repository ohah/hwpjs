//! Read-only semantic projection. Null is unknown, never an inferred NONE.
pub const Row = struct {
    id: u32,
    kind: ?@import("document.zig").CharacterUnderlineKind,
};
pub const StyleRow = struct {
    id: u32,
    raw_style: ?u32 = null,
    raw_color: ?u32 = null,
    shape: ?[]const u8 = null,
    color: ?[]const u8 = null,
};
