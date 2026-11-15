//! CT_Bar[3D]Chart, CT_Line[3D]Chart, CT_Area[3D]Chart, CT_RadarChart.
const Writer = @import("chart_create_writer.zig").Writer;
const model = @import("chart_create_data.zig");
const profiles = @import("chart_create_profile.zig");
pub fn write(w: *Writer, data: model.Data, p: profiles.Profile) !void {
    try w.open(@tagName(p.kind));
    if (p.bar_direction) |value| try w.option("barDir", @tagName(value));
    if (p.grouping) |value| try w.option("grouping", @tagName(value));
    if (p.radar_style) |value| try w.option("radarStyle", @tagName(value));
    try w.option("varyColors", "0");
    for (data.series, 0..) |series, ordinal| {
        try w.startSeries(series, ordinal);
        if (p.kind == .radarChart and p.radar_style == .marker) try w.add("<c:marker><c:symbol val=\"circle\"/></c:marker>");
        try w.categories(data, series);
        try w.close("ser");
    }
    if (profiles.isBar(p.kind)) {
        try w.option("gapWidth", "150");
        if (p.kind == .barChart) try w.option("overlap", if (p.grouping == .stacked or p.grouping == .percentStacked) "100" else "0");
    }
    if (p.kind == .bar3DChart or p.kind == .line3DChart or p.kind == .area3DChart) try w.option("gapDepth", "150");
    if (p.kind == .bar3DChart) try w.option("shape", "box");
    try @import("chart_create_axes.zig").ids(w, profiles.hasDepth(p.kind));
    try w.close(@tagName(p.kind));
}
