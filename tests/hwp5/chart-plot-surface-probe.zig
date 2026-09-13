const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
// Explicit test-only established scope. Does not discover a layout or reinterpret
// other object kinds: these two prefixes only register new inline identities.
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize, is_surface: bool) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    var input: core.Reader = .{ .bytes = bytes };
    const start = try input.readInt(u32);
    const type_count = try input.readInt(u32);
    const object_count = try input.readInt(u32);
    const max_objects = try input.readInt(u32);
    var types = core.hwp5.chart_type_table.Table.init(a, .{});
    defer types.deinit();
    var objects = core.hwp5.chart_object_table.Table.init(a, .{ .max_objects = max_objects });
    defer objects.deinit();
    for (0..type_count) |_| {
        const ref = try types.readObserved16(&input);
        if (!ref.introduced) return error.DuplicateChartObjectId;
    }
    for (0..object_count) |_| try objects.registerOther(try input.readInt(u32));
    var reader: core.Reader = .{ .bytes = bytes[input.offset..], .offset = start };
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    if (is_surface) {
        const value = try core.hwp5.chart_surface_prefix.readObservedEmptyArrayV1(&reader, &types, &objects);
        try appendSurface(a, &out, value, &types, &objects);
    } else {
        const value = try core.hwp5.chart_plot_prefix.readObservedEmptyArrayV4(&reader, &types, &objects);
        try appendPlot(a, &out, value, &types, &objects);
    }
    return out.toOwnedSlice(a);
}
pub fn appendPlot(a: std.mem.Allocator, out: *std.ArrayList(u8), value: core.hwp5.chart_plot_prefix.Prefix, types: *const core.hwp5.chart_type_table.Table, objects: *const core.hwp5.chart_object_table.Table) !void {
    try header(a, out, value.end, types, objects, value.object_id, value.initial);
    try out.appendSlice(a, &value.raw);
}
pub fn appendSurface(a: std.mem.Allocator, out: *std.ArrayList(u8), value: core.hwp5.chart_surface_prefix.Prefix, types: *const core.hwp5.chart_type_table.Table, objects: *const core.hwp5.chart_object_table.Table) !void {
    try header(a, out, value.end, types, objects, value.object_id, value.array);
    try out.appendSlice(a, &value.raw_before);
    try out.appendSlice(a, &value.raw_body);
}
fn header(a: std.mem.Allocator, out: *std.ArrayList(u8), end: usize, types: *const core.hwp5.chart_type_table.Table, objects: *const core.hwp5.chart_object_table.Table, id: u32, array: core.hwp5.chart_array_header.Header) !void {
    inline for (.{ end, types.definitions.count(), objects.entries.count(), id, array.object_id, array.end }) |v| try int(a, out, u32, @intCast(v));
    try int(a, out, u16, array.first_word);
    try int(a, out, u16, array.second_word);
}
