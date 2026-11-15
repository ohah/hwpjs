//! Chart-local reciprocal category/value/series axis graph. XY has two valAx.
const Writer = @import("chart_create_writer.zig").Writer;
const profile = @import("chart_create_profile.zig");
pub fn ids(w: *Writer, depth: bool) !void {
    try w.option("axId", "1");
    try w.option("axId", "2");
    if (depth) try w.option("axId", "3");
}
fn base(w: *Writer, id: []const u8, position: []const u8, cross: []const u8) !void {
    try w.option("axId", id);
    try w.add("<c:scaling><c:orientation val=\"minMax\"/></c:scaling>");
    try w.option("axPos", position);
    try w.option("tickLblPos", "nextTo");
    try w.option("crossAx", cross);
    try w.option("crosses", "autoZero");
}
pub fn write(w: *Writer, p: profile.Profile) !void {
    if (profile.isPie(p.kind)) return;
    const xy = profile.isXY(p.kind);
    const horizontal = p.bar_direction == .bar;
    const first = if (xy) "valAx" else "catAx";
    try w.open(first);
    try base(w, "1", if (horizontal) "l" else "b", "2");
    if (!xy) try w.add("<c:auto val=\"1\"/><c:lblAlgn val=\"ctr\"/><c:lblOffset val=\"100\"/>");
    try w.close(first);
    try w.open("valAx");
    try base(w, "2", if (horizontal) "b" else "l", "1");
    try w.option("crossBetween", "between");
    try w.close("valAx");
    if (profile.hasDepth(p.kind)) {
        try w.open("serAx");
        try base(w, "3", "b", "2");
        try w.close("serAx");
    }
}
