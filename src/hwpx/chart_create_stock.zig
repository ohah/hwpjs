//! CT_StockChart only: validated explicit HLC/OHLC order.
const Writer = @import("chart_create_writer.zig").Writer;
pub fn write(w: *Writer, data: @import("chart_create_data.zig").Data, p: @import("chart_create_profile.zig").Profile) !void {
    try w.open("stockChart");
    for (data.series, 0..) |series, ordinal| {
        try w.startSeries(series, ordinal);
        try w.add("<c:marker><c:symbol val=\"none\"/></c:marker>");
        try w.categories(data, series);
        try w.close("ser");
    }
    try w.add("<c:hiLowLines/>");
    if (p.stock_layout == .openHighLowClose) try w.add("<c:upDownBars><c:gapWidth val=\"150\"/><c:upBars/><c:downBars/></c:upDownBars>");
    try @import("chart_create_axes.zig").ids(w, false);
    try w.close("stockChart");
}
