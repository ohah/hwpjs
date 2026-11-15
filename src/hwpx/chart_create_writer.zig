//! Bounded XML primitives only. Family modules own schema child order.
const std = @import("std");
const model = @import("chart_create_data.zig");
pub const Writer = struct {
    a: std.mem.Allocator,
    out: std.ArrayList(u8) = .empty,
    pub fn deinit(w: *Writer) void {
        w.out.deinit(w.a);
    }
    pub fn add(w: *Writer, bytes: []const u8) !void {
        if (bytes.len > model.max_xml_bytes -| w.out.items.len) return error.LimitExceeded;
        try w.out.appendSlice(w.a, bytes);
    }
    pub fn number(w: *Writer, value: usize) !void {
        var buf: [32]u8 = undefined;
        try w.add(try std.fmt.bufPrint(&buf, "{d}", .{value}));
    }
    pub fn escaped(w: *Writer, value: []const u8) !void {
        const encoded = try @import("xstring.zig").encodeContent(w.a, value, model.max_xml_bytes);
        defer w.a.free(encoded);
        const xml = try @import("xml_source_writer.zig").write(w.a, "", &.{.{ .start = 0, .end = 0, .text = encoded }}, model.max_xml_bytes);
        defer w.a.free(xml);
        try w.add(xml);
    }
    pub fn open(w: *Writer, name: []const u8) !void {
        try w.add("<c:");
        try w.add(name);
        try w.add(">");
    }
    pub fn close(w: *Writer, name: []const u8) !void {
        try w.add("</c:");
        try w.add(name);
        try w.add(">");
    }
    pub fn option(w: *Writer, name: []const u8, value: []const u8) !void {
        try w.add("<c:");
        try w.add(name);
        try w.add(" val=\"");
        try w.add(value);
        try w.add("\"/>");
    }
    pub fn startSeries(w: *Writer, series: model.Series, ordinal: usize) !void {
        try w.add("<c:ser><c:idx val=\"");
        try w.number(ordinal);
        try w.add("\"/><c:order val=\"");
        try w.number(ordinal);
        try w.add("\"/><c:tx><c:v>");
        try w.escaped(series.name);
        try w.add("</c:v></c:tx>");
    }
    pub fn literal(w: *Writer, role: []const u8, values: []const []const u8, text: bool) !void {
        try w.open(role);
        const tag = if (text) "strLit" else "numLit";
        try w.open(tag);
        if (!text) try w.add("<c:formatCode>General</c:formatCode>");
        try w.add("<c:ptCount val=\"");
        try w.number(values.len);
        try w.add("\"/>");
        for (values, 0..) |value, index| {
            try w.add("<c:pt idx=\"");
            try w.number(index);
            try w.add("\"><c:v>");
            if (text) try w.escaped(value) else try w.add(value);
            try w.add("</c:v></c:pt>");
        }
        try w.close(tag);
        try w.close(role);
    }
    pub fn categories(w: *Writer, data: model.Data, series: model.Series) !void {
        try w.literal("cat", data.categories, true);
        try w.literal("val", series.values, false);
    }
};
