//! Focused source-only entry; compile/run only with the coordinator's Native slot.
comptime {
    _ = @import("hwp5/edit/cell_border_tests.zig");
    _ = @import("hwp5/edit/cell_border_session_tests.zig");
    // Existing background feature must share the same COW/history plan and pass.
    _ = @import("hwp5/edit/cell_background_tests.zig");
    _ = @import("hwp5/edit/cell_background_session_tests.zig");
}
