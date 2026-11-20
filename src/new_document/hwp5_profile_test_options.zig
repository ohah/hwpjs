//! Shared synthetic Native table-creation options, never a production default.
pub fn creationOptions() @import("../hwp5/edit/created_table_records.zig").Options {
    return .{
        .common = .{ .flags = 0x6a2211, .offset_x = 0, .offset_y = 0, .z_order = 0, .margins = .{ 0, 0, 0, 0 }, .prevent_page_break = false, .description = "" },
        .table = .{ .page_break = 1, .repeat_header = false, .cell_spacing = 0, .margins = .{ 0, 0, 0, 0 } },
        .cell = .{ .layout = .observed8, .unknown = 0, .attributes = 0, .margins = .{ 0, 0, 0, 0 } },
    };
}
