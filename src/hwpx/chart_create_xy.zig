//! CT_ScatterChart / CT_BubbleChart: numeric X, Y and explicit bubble size.
const Writer = @import("chart_create_writer.zig").Writer;
pub fn write(w: *Writer, data: @import("chart_create_data.zig").Data, p: @import("chart_create_profile.zig").Profile) !void {
    try w.open(@tagName(p.kind));
    if (p.scatter_style) |value| try w.option("scatterStyle", @tagName(value));
    try w.option("varyColors", "0");
    for (data.series, 0..) |series, ordinal| {
        try w.startSeries(series, ordinal);
        // Explicit marker for marker-bearing styles; smoothing is per series.
        if (p.scatter_style) |style| {
            const marker = style == .marker or style == .lineMarker or style == .smoothMarker;
            if (style == .marker or style == .none) try w.add("<c:spPr xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\"><a:ln><a:noFill/></a:ln></c:spPr>");
            try w.add("<c:marker>");
            try w.option("symbol", if (marker) "circle" else "none");
            try w.close("marker");
        }
        try w.literal("xVal", series.x_values.?, false);
        try w.literal("yVal", series.values, false);
        if (series.bubble_sizes) |sizes| try w.literal("bubbleSize", sizes, false);
        if (p.scatter_style) |style| try w.option("smooth", if (style == .smooth or style == .smoothMarker) "1" else "0");
        try w.close("ser");
    }
    if (p.kind == .bubbleChart) {
        try w.option("bubble3D", "0");
        try w.option("bubbleScale", "100");
        try w.option("showNegBubbles", "0");
        try w.option("sizeRepresents", "area");
    }
    try @import("chart_create_axes.zig").ids(w, false);
    try w.close(@tagName(p.kind));
}
