//! Run only in the main-owned serialized Native slot. No protected fixtures.
comptime {
    _ = @import("hwpx/table_cell_border_tests.zig");
    _ = @import("hwpx/table_cell_background_tests.zig");
}
