//! Family dispatch only. Legacy bytes are owned by chart_create_xml.create.
const std = @import("std");
const model = @import("chart_create_data.zig");
const profiles = @import("chart_create_profile.zig");
pub fn create(a: std.mem.Allocator, data: model.Data, p: profiles.Profile) ![]u8 {
    try model.validateFor(data, p);
    var w: @import("chart_create_writer.zig").Writer = .{ .a = a };
    defer w.deinit();
    try w.add("<?xml version=\"1.0\" encoding=\"UTF-8\"?><c:chartSpace xmlns:c=\"http://schemas.openxmlformats.org/drawingml/2006/chart\"><c:chart>");
    // Authored new-chart presentation settings; never effective read defaults.
    if (p.kind == .pie3DChart) {
        try w.add("<c:view3D><c:rotX val=\"30\"/><c:hPercent val=\"100\"/><c:rotY val=\"0\"/><c:depthPercent val=\"100\"/><c:rAngAx val=\"0\"/><c:perspective val=\"30\"/></c:view3D>");
    } else if (profiles.is3D(p.kind)) {
        try w.add("<c:view3D><c:rotX val=\"15\"/><c:hPercent val=\"100\"/><c:rotY val=\"20\"/><c:depthPercent val=\"100\"/><c:rAngAx val=\"1\"/></c:view3D>");
    }
    try w.add("<c:plotArea><c:layout/>");
    switch (p.kind) {
        .barChart, .bar3DChart, .lineChart, .line3DChart, .areaChart, .area3DChart, .radarChart => try @import("chart_create_category.zig").write(&w, data, p),
        .pieChart, .pie3DChart, .doughnutChart, .ofPieChart => try @import("chart_create_pie.zig").write(&w, data, p),
        .scatterChart, .bubbleChart => try @import("chart_create_xy.zig").write(&w, data, p),
        .stockChart => try @import("chart_create_stock.zig").write(&w, data, p),
        .surfaceChart, .surface3DChart => try @import("chart_create_surface.zig").write(&w, data, p),
    }
    try @import("chart_create_axes.zig").write(&w, p);
    try w.add("</c:plotArea><c:legend><c:legendPos val=\"r\"/><c:layout/></c:legend><c:plotVisOnly val=\"1\"/><c:dispBlanksAs val=\"gap\"/><c:showDLblsOverMax val=\"0\"/></c:chart></c:chartSpace>");
    return w.out.toOwnedSlice(a);
}
