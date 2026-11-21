test "register H5 existing PAGE restart edit" {
    _ = @import("hwp5/edit/page_restart_edit_tests.zig");
}
test "register HX existing PAGE restart edit" {
    _ = @import("hwpx/page_restart_edit_tests.zig");
}
test "register PAGE restart binding" {
    _ = @import("model/page_restart_edit.zig");
}
test "register PAGE restart managed History2" {
    _ = @import("page_restart_history_tests.zig");
}
