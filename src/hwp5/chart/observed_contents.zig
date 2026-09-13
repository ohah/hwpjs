const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const prefixes = @import("contents_prefix.zig");
const plots = @import("plot_prefix.zig");
const lights = @import("light.zig");
const axes = @import("axis.zig");
const surfaces = @import("surface_prefix.zig");
const lines = @import("line_item.zig");
const post_lines = @import("post_line.zig");
const collections = @import("series_collection.zig");
const titles = @import("title.zig");
const tails = @import("tail.zig");
/// Required caller selection, NOT inferred from opaque array words or markers.
/// Counts are used during the call only; the returned document does not borrow
/// this slice. Individual components retain their own selected-layout gates.
pub const Layout = struct {
    primary_axis_count: usize,
    line_item_count: usize,
    series_point_counts: []const usize,
};
pub const Options = struct {
    prefix: prefixes.Options = .{},
    light: lights.Options = .{},
    axis: axes.Options = .{},
    series: collections.Options = .{},
    title: titles.Options = .{},
    max_axes: usize = 65535,
    max_line_items: usize = 65535,
};
pub const Contents = struct {
    allocator: std.mem.Allocator,
    prefix: prefixes.Prefix,
    plot: plots.Prefix,
    light: lights.Light,
    primary_axes: []axes.Axis,
    surface: surfaces.Prefix,
    secondary_axis: axes.NullableTitleAxis,
    line_word: u16,
    line_items: []lines.Item,
    post_line: post_lines.Block,
    series: collections.Collection,
    title: titles.Body,
    tail: tails.Tail,
    end: usize,
    pub fn deinit(self: *Contents) void {
        self.series.deinit();
        self.allocator.free(self.line_items);
        self.allocator.free(self.primary_axes);
        self.light.deinit();
        self.prefix.deinit();
        self.* = undefined;
    }
};
/// Complete consumption of ONE explicitly selected observed layout. Not an
/// automatic format recognizer or a complete identity graph/semantic validator.
/// Owns all allocated results, but every String still borrows retained bytes.
/// No retries or fallback layouts. On any error all owned storage is freed.
pub fn readObservedV6(a: std.mem.Allocator, bytes: []const u8, layout: Layout, options: Options) !Contents {
    if (layout.primary_axis_count > options.max_axes or layout.line_item_count > options.max_line_items)
        return error.LimitExceeded;
    try collections.validateCounts(layout.series_point_counts, options.series);
    var prefix = try prefixes.readObservedV6(a, bytes, options.prefix);
    errdefer prefix.deinit();
    var reader: Reader = .{ .bytes = bytes, .offset = prefix.end };
    const types = &prefix.grid.prelude.types;
    const objects = &prefix.objects;
    const plot = try plots.readObservedEmptyArrayV4(&reader, types, objects);
    var light = try lights.readObservedV1(a, &reader, types, objects, options.light);
    errdefer light.deinit();
    const primary_axes = try a.alloc(axes.Axis, layout.primary_axis_count);
    errdefer a.free(primary_axes);
    for (primary_axes) |*axis| axis.* = try axes.readObservedV3(&reader, types, objects, options.axis);
    const surface = try surfaces.readObservedEmptyArrayV1(&reader, types, objects);
    const secondary_axis = try axes.readNullableTitleObservedV3(&reader, types, objects, options.axis);
    const line_word = try reader.readInt(u16);
    const line_items = try a.alloc(lines.Item, layout.line_item_count);
    errdefer a.free(line_items);
    for (line_items) |*item| item.* = try lines.readObservedV1(&reader, types, objects);
    const post_line = try post_lines.readObserved(&reader, types, objects);
    var series = try collections.readObserved(a, &reader, types, objects, layout.series_point_counts, options.series);
    errdefer series.deinit();
    const title = try titles.readBodyObservedV1(&reader, types, objects, options.title);
    const tail = try tails.readObservedNoItems(&reader, types, objects);
    if (reader.offset != bytes.len) return error.UnexpectedChartTrailingBytes;
    return .{ .allocator = a, .prefix = prefix, .plot = plot, .light = light, .primary_axes = primary_axes, .surface = surface, .secondary_axis = secondary_axis, .line_word = line_word, .line_items = line_items, .post_line = post_line, .series = series, .title = title, .tail = tail, .end = reader.offset };
}
