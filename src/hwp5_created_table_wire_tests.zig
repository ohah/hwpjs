// Focused wire tests without importing unpublished Session/ABI extensions.
comptime {
    _ = @import("hwp5/edit/created_table_payloads_tests.zig");
    _ = @import("hwp5/edit/created_table_cell_records_tests.zig");
    _ = @import("hwp5/edit/created_table_records_tests.zig");
}
