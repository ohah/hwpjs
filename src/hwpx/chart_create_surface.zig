//! CT_SurfaceChart / CT_Surface3DChart only: explicit rectangular matrix.
const Writer = @import("chart_create_writer.zig").Writer;
pub fn write(w: *Writer, data: @import("chart_create_data.zig").Data, p: @import("chart_create_profile.zig").Profile) !void {
    try w.open(@tagName(p.kind));
    try w.option("wireframe", if (p.wireframe.?) "1" else "0");
    for (data.series, 0..) |series, ordinal| {
        try w.startSeries(series, ordinal);
        try w.categories(data, series);
        try w.close("ser");
    }
    try @import("chart_create_axes.zig").ids(w, true);
    try w.close(@tagName(p.kind));
}
