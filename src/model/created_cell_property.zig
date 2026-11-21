const geometry = @import("table_creation_plan.zig");
pub const Property = struct {
    geometry: geometry.Cell,
    // Null retains the format-owned creation profile; never a guessed TOP.
    vertical_alignment: ?@import("cell_vertical_alignment.zig").Alignment = null,
    width_changed: bool = false,
    height_changed: bool = false,
    appearance: @import("border_fill_patch.zig").Patch = .{},
    // Only transient save clones receive this Native-resolved resource ID.
    materialized_border_fill: ?u32 = null,
};
