//! No templates, external workbook, formulas, or synthetic picture fallback.
//! ECMA-376-1:2016 chart CT_BarChart / CT_BarSer / CT_CatAx / CT_ValAx.
const std = @import("std");
const model = @import("chart_create_data.zig");

pub fn create(a: std.mem.Allocator, data: model.Data) ![]u8 {
    try model.validate(data);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try add(a, &out, "<?xml version=\"1.0\" encoding=\"UTF-8\"?><c:chartSpace xmlns:c=\"http://schemas.openxmlformats.org/drawingml/2006/chart\"><c:chart><c:plotArea><c:layout/><c:barChart><c:barDir val=\"col\"/><c:grouping val=\"clustered\"/><c:varyColors val=\"0\"/>");
    for (data.series, 0..) |series, ordinal| {
        try add(a, &out, "<c:ser><c:idx val=\"");
        try number(a, &out, ordinal);
        try add(a, &out, "\"/><c:order val=\"");
        try number(a, &out, ordinal);
        try add(a, &out, "\"/><c:tx><c:v>");
        try escaped(a, &out, series.name);
        try add(a, &out, "</c:v></c:tx><c:cat><c:strLit><c:ptCount val=\"");
        try number(a, &out, data.categories.len);
        try add(a, &out, "\"/>");
        for (data.categories, 0..) |value, index| try point(a, &out, index, value, true);
        try add(a, &out, "</c:strLit></c:cat><c:val><c:numLit><c:formatCode>General</c:formatCode><c:ptCount val=\"");
        try number(a, &out, series.values.len);
        try add(a, &out, "\"/>");
        for (series.values, 0..) |value, index| try point(a, &out, index, value, false);
        try add(a, &out, "</c:numLit></c:val></c:ser>");
    }
    // Axis IDs are chart-part-local and reciprocal; unrelated to HWPX object IDs.
    try add(a, &out, "<c:gapWidth val=\"150\"/><c:overlap val=\"0\"/><c:axId val=\"1\"/><c:axId val=\"2\"/></c:barChart>" ++
        "<c:catAx><c:axId val=\"1\"/><c:scaling><c:orientation val=\"minMax\"/></c:scaling><c:axPos val=\"b\"/><c:tickLblPos val=\"nextTo\"/><c:crossAx val=\"2\"/><c:crosses val=\"autoZero\"/><c:auto val=\"1\"/><c:lblAlgn val=\"ctr\"/><c:lblOffset val=\"100\"/></c:catAx>" ++
        "<c:valAx><c:axId val=\"2\"/><c:scaling><c:orientation val=\"minMax\"/></c:scaling><c:axPos val=\"l\"/><c:majorGridlines/><c:numFmt formatCode=\"General\" sourceLinked=\"0\"/><c:tickLblPos val=\"nextTo\"/><c:crossAx val=\"1\"/><c:crosses val=\"autoZero\"/><c:crossBetween val=\"between\"/></c:valAx>" ++
        "</c:plotArea><c:legend><c:legendPos val=\"r\"/><c:layout/></c:legend><c:plotVisOnly val=\"1\"/><c:dispBlanksAs val=\"gap\"/><c:showDLblsOverMax val=\"0\"/></c:chart></c:chartSpace>");
    return out.toOwnedSlice(a);
}

fn add(a: std.mem.Allocator, out: *std.ArrayList(u8), bytes: []const u8) !void {
    if (bytes.len > model.max_xml_bytes -| out.items.len) return error.LimitExceeded;
    try out.appendSlice(a, bytes);
}
fn number(a: std.mem.Allocator, out: *std.ArrayList(u8), value: usize) !void {
    var buf: [32]u8 = undefined;
    try add(a, out, try std.fmt.bufPrint(&buf, "{d}", .{value}));
}
fn escaped(a: std.mem.Allocator, out: *std.ArrayList(u8), value: []const u8) !void {
    const bytes = try @import("xstring.zig").encodeContent(a, value, model.max_xml_bytes);
    defer a.free(bytes);
    const xml = try @import("xml_source_writer.zig").write(a, "", &.{.{ .start = 0, .end = 0, .text = bytes }}, model.max_xml_bytes);
    defer a.free(xml);
    try add(a, out, xml);
}
fn point(a: std.mem.Allocator, out: *std.ArrayList(u8), index: usize, value: []const u8, is_text: bool) !void {
    try add(a, out, "<c:pt idx=\"");
    try number(a, out, index);
    try add(a, out, "\"><c:v>");
    if (is_text) try escaped(a, out, value) else try add(a, out, value);
    try add(a, out, "</c:v></c:pt>");
}
