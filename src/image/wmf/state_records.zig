const Header = @import("header.zig").Header;
const records = @import("records.zig");
const color_ref = @import("color_ref.zig");
const mode_record = @import("mode_record.zig");
const point_record = @import("point_record.zig");
const text_color = @import("text_color.zig");

pub const Report = struct {
    background_opaque: usize,
    background_transparent: usize,
    raster_operations: usize,
    polygon_alternate: usize,
    polygon_winding: usize,
    text_colors: usize,
    nonzero_color_reserved: usize,
    window_origins: usize,
    window_extents: usize,
    window_origin_x_sum: i64,
    window_origin_y_sum: i64,
    window_extent_x_sum: i64,
    window_extent_y_sum: i64,
    moves: usize,
    lines: usize,
    move_x_sum: i64,
    move_y_sum: i64,
    line_x_sum: i64,
    line_y_sum: i64,
};

pub fn inspect(bytes: []const u8, header: Header, framing: records.Summary, color_policy: color_ref.ReservedPolicy) !Report {
    var iterator = try records.Iterator.init(bytes, header.records_offset, framing.eof_end);
    var report: Report = .{ .background_opaque = 0, .background_transparent = 0, .raster_operations = 0, .polygon_alternate = 0, .polygon_winding = 0, .text_colors = 0, .nonzero_color_reserved = 0, .window_origins = 0, .window_extents = 0, .window_origin_x_sum = 0, .window_origin_y_sum = 0, .window_extent_x_sum = 0, .window_extent_y_sum = 0, .moves = 0, .lines = 0, .move_x_sum = 0, .move_y_sum = 0, .line_x_sum = 0, .line_y_sum = 0 };
    while (try iterator.next()) |record| switch (record.function) {
        0x0102 => {
            const value = try mode_record.parse(record, .background);
            if (value.raw == 1) report.background_transparent += 1 else report.background_opaque += 1;
        },
        0x0104 => {
            _ = try mode_record.parse(record, .raster_operation);
            report.raster_operations += 1;
        },
        0x0106 => {
            const value = try mode_record.parse(record, .polygon_fill);
            if (value.raw == 1) report.polygon_alternate += 1 else report.polygon_winding += 1;
        },
        0x0209 => {
            const value = try text_color.parse(record, color_policy);
            report.text_colors += 1;
            if (value.reserved != 0) report.nonzero_color_reserved += 1;
        },
        0x020b => {
            const value = try point_record.parse(record, .window_origin);
            report.window_origins += 1;
            report.window_origin_x_sum += value.point.x;
            report.window_origin_y_sum += value.point.y;
        },
        0x020c => {
            const value = try point_record.parse(record, .window_extent);
            report.window_extents += 1;
            report.window_extent_x_sum += value.point.x;
            report.window_extent_y_sum += value.point.y;
        },
        0x0214 => {
            const value = try point_record.parse(record, .move_to);
            report.moves += 1;
            report.move_x_sum += value.point.x;
            report.move_y_sum += value.point.y;
        },
        0x0213 => {
            const value = try point_record.parse(record, .line_to);
            report.lines += 1;
            report.line_x_sum += value.point.x;
            report.line_y_sum += value.point.y;
        },
        else => {},
    };
    return report;
}
