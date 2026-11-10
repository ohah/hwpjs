//! Focused synthetic model foundation; deliberately excludes root.zig and Session.
test {
    _ = @import("hwp5/edit/editor_checkpoint.zig");
    _ = @import("model/clone.zig");
    _ = @import("hwp5/edit/section_source_basis_tests.zig");
}
