const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var input: core.Reader = .{ .bytes = bytes };
    const per = try input.readInt(u32);
    const total = try input.readInt(u32);
    const max_objects = try input.readInt(u32);
    const stored = try input.readInt(u32);
    const contents = bytes[input.offset..];
    if (contents.len > limit) return error.LimitExceeded;
    var prefix = try @import("chart-light-prefix.zig").read(a, contents, limit, 65535, max_objects);
    defer prefix.deinit();
    const reader = &prefix.previous.previous.reader;
    const types = &prefix.previous.previous.grid.prelude.types;
    const objects = &prefix.previous.objects;
    if (objects.string_bytes > stored) return error.LimitExceeded;
    objects.options.max_total_string_bytes = stored;
    // Selected corpus prefix only, not a product four-axis/Surface contract.
    for (0..4) |_| _ = try core.hwp5.chart_axis.readObservedV3(reader, types, objects, .{});
    _ = try reader.take(30);
    try objects.registerOther(try reader.readInt(u32));
    try core.hwp5.chart_type_checks.require(types, reader, "VtSurfaceDesc\x00", 1);
    _ = try reader.take(46);
    const array = try core.hwp5.chart_array_header.readObservedV1(reader, types, objects);
    if (try array.observedEqualCount(0) != 0) return error.UnsupportedChartArrayLayout;
    const axis = try core.hwp5.chart_axis.readNullableTitleObservedV3(reader, types, objects, .{ .max_string_bytes = per, .max_total_string_bytes = total });
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (.{ reader.offset, types.definitions.count(), objects.entries.count(), objects.string_bytes }) |v| try int(a, &out, u32, @intCast(v));
    try @import("chart-axes-probe.zig").serialize(a, &out, axis, objects);
    return out.toOwnedSlice(a);
}
