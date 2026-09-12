const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
const Objects = core.hwp5.chart_object_table.Table;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var input: core.Reader = .{ .bytes = bytes };
    const per = try input.readInt(u32);
    const total = try input.readInt(u32);
    const max_objects = try input.readInt(u32);
    const stored = try input.readInt(u32);
    const count = try input.readInt(u32);
    if (count > 32) return error.LimitExceeded; // Probe request bound, not core axis count.
    const contents = bytes[input.offset..];
    if (contents.len > limit) return error.LimitExceeded;
    var prefix = try @import("chart-light-prefix.zig").read(a, contents, limit, 65535, max_objects);
    defer prefix.deinit();
    const reader = &prefix.previous.previous.reader;
    const types = &prefix.previous.previous.grid.prelude.types;
    const objects = &prefix.previous.objects;
    if (objects.string_bytes > stored) return error.LimitExceeded;
    objects.options.max_total_string_bytes = stored;
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try out.appendSlice(a, &@as([20]u8, @splat(0)));
    var number_count: u32 = 0;
    for (prefix.previous.previous.grid.cells) |cell| if (cell.value == .number) {
        number_count += 1;
    };
    try int(a, &out, u32, number_count);
    // Resolve seeded numeric identities through the shared map, not directly
    // from grid payloads, so Other registration or lost bits are observable.
    for (prefix.previous.previous.grid.cells) |cell| if (cell.value == .number) {
        var id_bytes: [4]u8 = undefined;
        std.mem.writeInt(u32, &id_bytes, cell.object_id.?, .little);
        var lookup: core.Reader = .{ .bytes = &id_bytes };
        const ref = try objects.readValueObservedV1(&lookup, types, 0);
        const n = switch (ref.value) {
            .number => |n| n,
            else => return error.UnsupportedChartObjectReference,
        };
        try int(a, &out, u32, n.object_id);
        try int(a, &out, u64, n.bits);
        try int(a, &out, u16, n.trailer);
    };
    for (0..count) |_| {
        const axis = try core.hwp5.chart_axis.readObservedV3(reader, types, objects, .{ .max_string_bytes = per, .max_total_string_bytes = total });
        try serialize(a, &out, axis, objects);
    }
    const fields = [_]usize{ count, reader.offset, types.definitions.count(), objects.entries.count(), objects.string_bytes };
    for (fields, 0..) |v, i| std.mem.writeInt(u32, out.items[i * 4 ..][0..4], @intCast(v), .little);
    return out.toOwnedSlice(a);
}
fn array(a: std.mem.Allocator, out: *std.ArrayList(u8), h: core.hwp5.chart_array_header.Header) !void {
    inline for (.{ h.object_id, h.first_word, h.second_word, h.end }) |v| try int(a, out, u32, @intCast(v));
}
fn serialize(a: std.mem.Allocator, out: *std.ArrayList(u8), axis: core.hwp5.chart_axis.Axis, objects: *const Objects) !void {
    inline for (.{ axis.object_id, axis.end, @intFromBool(axis.scale != null), axis.title.object_id }) |v| try int(a, out, u32, @intCast(v));
    try out.appendSlice(a, &axis.raw);
    const t = axis.title;
    const title = try @import("chart-text-body-probe.zig").serialize(a, .{ .prefix = t.prefix, .font = t.font, .middle = t.middle, .text = t.text, .suffix = t.suffix, .end = t.end, .backdrop = t.backdrop, .text_introduced = t.text_introduced }, objects);
    defer a.free(title);
    try out.appendSlice(a, title);
    try array(a, out, axis.scale_array);
    if (axis.scale) |s| {
        try int(a, out, u32, s.object_id);
        try int(a, out, u32, @intCast(s.end));
        try array(a, out, s.array);
        const value = try @import("chart-value-block-probe.zig").serialize(a, s.value, objects);
        defer a.free(value);
        try out.appendSlice(a, value);
    }
    try int(a, out, u32, @intFromBool(axis.tail.extra != null));
    try int(a, out, u32, @intCast(axis.tail.end));
    try out.appendSlice(a, &axis.tail.prefix);
    if (axis.tail.extra) |raw| try out.appendSlice(a, &raw);
    try out.appendSlice(a, &axis.tail.suffix);
}
