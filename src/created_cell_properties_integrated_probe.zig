// One root registration; no duplicate focused-probe import or OOM inclusion.
test {
    _ = @import("created_cell_persistence_tests.zig");
    _ = @import("created_cell_projection_tests.zig");
}
