//! Isolated memory-only Native wrapper; no root suite or fixture imports.
comptime {
    _ = @import("hwpx/generated_atomic_r1_tests.zig");
}
