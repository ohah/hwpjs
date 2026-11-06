//! Focused Native regression entry; the library test index imports this same set.
comptime {
    _ = @import("hwp5_cell_background_probe.zig");
    _ = @import("hwpx/table_cell_background_tests.zig");
}
