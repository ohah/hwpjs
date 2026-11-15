//! CT_Pie[3D]Chart / CT_DoughnutChart / CT_OfPieChart. Never writes axes.
const Writer = @import("chart_create_writer.zig").Writer;
pub fn write(w: *Writer, data: @import("chart_create_data.zig").Data, p: @import("chart_create_profile.zig").Profile) !void {
    try w.open(@tagName(p.kind));
    if (p.of_pie_type) |value| try w.option("ofPieType", @tagName(value));
    try w.option("varyColors", "1");
    for (data.series, 0..) |series, ordinal| {
        try w.startSeries(series, ordinal);
        try w.categories(data, series);
        try w.close("ser");
    }
    if (p.kind == .pieChart or p.kind == .doughnutChart) try w.option("firstSliceAng", "0");
    if (p.kind == .doughnutChart) try w.option("holeSize", "50");
    if (p.kind == .ofPieChart) try w.option("splitType", "auto");
    try w.close(@tagName(p.kind));
}
