// Regular synthetic-only root. Official reference inputs are a separate sidecar.
test {
    _ = @import("hwp5/chart/ooxml_resource_tests.zig");
    _ = @import("hwp5/edit/binary_resource_index.zig");
}
