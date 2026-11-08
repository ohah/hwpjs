test "표 삭제 보호 검사 등록" {
    _ = @import("hwp5/edit/table_deletion_tests.zig");
    _ = @import("table_deletion_protection_tests.zig");
    _ = @import("file_transform_policy_tests.zig");
    _ = @import("hwpx/table_deletion_tests.zig");
    _ = @import("hwpx/table_deletion_file_tests.zig");
    _ = @import("wasm/table_file_delete_output_tests.zig");
    _ = @import("table_file_delete_actual_probe.zig");
    _ = @import("image_insertion_all_probe.zig");
}
