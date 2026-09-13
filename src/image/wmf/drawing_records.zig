const Header = @import("header.zig").Header;
const records = @import("records.zig");
const poly_record = @import("poly_record.zig");
const rect_record = @import("rect_record.zig");

pub const Report = struct {
    polygons: usize,
    polygon_points: usize,
    polygon_x_sum: i64,
    polygon_y_sum: i64,
    polylines: usize,
    polyline_points: usize,
    polyline_x_sum: i64,
    polyline_y_sum: i64,
    ellipses: usize,
    ellipse_left_sum: i64,
    ellipse_top_sum: i64,
    ellipse_right_sum: i64,
    ellipse_bottom_sum: i64,
    rectangles: usize,
    rectangle_left_sum: i64,
    rectangle_top_sum: i64,
    rectangle_right_sum: i64,
    rectangle_bottom_sum: i64,
};

fn addPoints(report_count: *usize, x_sum: *i64, y_sum: *i64, points: @import("point_array.zig").Points) !void {
    report_count.* += points.count;
    for (0..points.count) |index| {
        const point = try points.get(index);
        x_sum.* += point.x;
        y_sum.* += point.y;
    }
}

fn addRect(left: *i64, top: *i64, right: *i64, bottom: *i64, rect: @import("rect.zig").Rect) void {
    left.* += rect.left;
    top.* += rect.top;
    right.* += rect.right;
    bottom.* += rect.bottom;
}

pub fn inspect(bytes: []const u8, header: Header, framing: records.Summary) !Report {
    var iterator = try records.Iterator.init(bytes, header.records_offset, framing.eof_end);
    var report: Report = .{ .polygons = 0, .polygon_points = 0, .polygon_x_sum = 0, .polygon_y_sum = 0, .polylines = 0, .polyline_points = 0, .polyline_x_sum = 0, .polyline_y_sum = 0, .ellipses = 0, .ellipse_left_sum = 0, .ellipse_top_sum = 0, .ellipse_right_sum = 0, .ellipse_bottom_sum = 0, .rectangles = 0, .rectangle_left_sum = 0, .rectangle_top_sum = 0, .rectangle_right_sum = 0, .rectangle_bottom_sum = 0 };
    while (try iterator.next()) |record| switch (record.function) {
        0x0324 => {
            const value = try poly_record.parse(record, .polygon);
            report.polygons += 1;
            try addPoints(&report.polygon_points, &report.polygon_x_sum, &report.polygon_y_sum, value.points);
        },
        0x0325 => {
            const value = try poly_record.parse(record, .polyline);
            report.polylines += 1;
            try addPoints(&report.polyline_points, &report.polyline_x_sum, &report.polyline_y_sum, value.points);
        },
        0x0418 => {
            const value = try rect_record.parse(record, .ellipse);
            report.ellipses += 1;
            addRect(&report.ellipse_left_sum, &report.ellipse_top_sum, &report.ellipse_right_sum, &report.ellipse_bottom_sum, value.rect);
        },
        0x041b => {
            const value = try rect_record.parse(record, .rectangle);
            report.rectangles += 1;
            addRect(&report.rectangle_left_sum, &report.rectangle_top_sum, &report.rectangle_right_sum, &report.rectangle_bottom_sum, value.rect);
        },
        else => {},
    };
    return report;
}
