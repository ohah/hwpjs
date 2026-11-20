//! Focused source entry; execution needs a separate Main grant. All inputs are
//! created in memory. Root's existing new_document_probe imports these too.
comptime {
    _ = @import("hwp5/body/section_child_writer_tests.zig");
    _ = @import("new_document/section_children_tests.zig");
    _ = @import("new_document/hwp5_profile_tests.zig");
}
