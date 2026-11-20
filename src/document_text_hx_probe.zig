//! Focused HX source target; coordinator grant is required for execution.
test {
    _ = @import("hwpx/document_text_inventory_tests.zig");
    _ = @import("hwpx/created_cell_text_batch_tests.zig");
    _ = @import("hwpx/zero_width_coordinate_batch.zig");
    _ = @import("hwpx/paragraph_boundary_cursor.zig");
    _ = @import("hwpx/source_metadata_coordinates.zig");
    _ = @import("hwpx/page_area_current_validate.zig");
    _ = @import("hwpx/page_area_text_batch_tests.zig");
    _ = @import("hwpx/created_table_read_placements_tests.zig");
    _ = @import("hwpx/document_text_snapshot_tests.zig");
    _ = @import("hwpx/document_text_read_projection.zig");
    _ = @import("hwpx/document_text_source_axis.zig");
    _ = @import("hwpx/document_replace_all_tests.zig");
    _ = @import("hwpx/title_mark_text_batch_tests.zig");
}
