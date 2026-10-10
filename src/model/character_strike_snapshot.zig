//! Unknown source kinds remain null rather than becoming inactive.
pub const Row = struct { id: u32, enabled: ?bool };
pub const StyleRow = struct {
    id: u32,
    raw_style: ?u32 = null,
    raw_color: ?u32 = null,
    shape: ?[]const u8 = null,
    color: ?[]const u8 = null,
};
