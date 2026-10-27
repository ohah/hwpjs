//! Focused import entry for a future composed workspace; not registered/applied now.
comptime {
    _ = @import("formatting_patch_tests.zig");
    _ = @import("formatting_projection_tests.zig");
    _ = @import("formatting_format_tests.zig");
    _ = @import("formatting_resource_tests.zig");
}
