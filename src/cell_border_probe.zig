//! Focused border regression collection; shares the production cell resource plan.
comptime {
    _ = @import("hwp5_cell_border_probe.zig");
    _ = @import("hwpx_cell_border_probe.zig");
    _ = @import("wasm/cell_border.zig");
}
