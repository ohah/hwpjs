const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
// Explicit isolated ValueBlock scope, not full chart identity validation.
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    var input: core.Reader = .{ .bytes = bytes };
    const per = try input.readInt(u32);
    const total = try input.readInt(u32);
    const max_objects = try input.readInt(u32);
    const stored = try input.readInt(u32);
    const type_count = try input.readInt(u32);
    const string_count = try input.readInt(u32);
    const number_count = try input.readInt(u32);
    var types = core.hwp5.chart_type_table.Table.init(a, .{});
    defer types.deinit();
    var objects = core.hwp5.chart_object_table.Table.init(a, .{ .max_objects = max_objects, .max_total_string_bytes = stored });
    defer objects.deinit();
    for (0..type_count) |_| {
        const ref = try types.readObserved16(&input);
        if (!ref.introduced) return error.DuplicateChartObjectId;
    }
    for (0..string_count) |_| {
        const id = try input.readInt(u32);
        const n = try input.readInt(u32);
        const raw = try input.take(n);
        const trailer = try input.readInt(u8);
        try objects.registerString(.{ .object_id = id, .bytes = raw, .trailer = trailer });
    }
    for (0..number_count) |_| {
        const id = try input.readInt(u32);
        const bits = try input.readInt(u64);
        const trailer = try input.readInt(u16);
        try objects.registerNumber(.{ .object_id = id, .bits = bits, .trailer = trailer });
    }
    var reader: core.Reader = .{ .bytes = bytes[input.offset..] };
    const b = try core.hwp5.chart_value_block.readObservedV1(&reader, &types, &objects, .{ .max_string_bytes = per, .max_total_string_bytes = total });
    return serialize(a, b, &objects);
}
pub fn serialize(a: std.mem.Allocator, b: core.hwp5.chart_value_block.Block, objects: *const core.hwp5.chart_object_table.Table) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (.{ b.header_word, b.raw_before_label, b.end, @intFromBool(b.format != null) }) |field| try int(a, &out, u32, @intCast(field));
    try out.appendSlice(a, &b.raw_suffix);
    if (b.reference) |r| {
        switch (r.value) {
            .string => |s| {
                try int(a, &out, u32, 1);
                try string(a, &out, s, r.introduced);
                inline for (.{ r.start, r.end }) |v| try int(a, &out, u32, @intCast(v));
            },
            .number => |n| {
                for ([_]u32{ 2, n.object_id, n.trailer, @intFromBool(r.introduced) }) |v| try int(a, &out, u32, v);
                try int(a, &out, u64, n.bits);
                inline for (.{ r.start, r.end }) |v| try int(a, &out, u32, @intCast(v));
            },
        }
    } else try int(a, &out, u32, 0);
    if (b.format) |f| {
        inline for (.{ f.object_id, f.raw_word, f.end }) |v| try int(a, &out, u32, @intCast(v));
        try string(a, &out, f.code, f.code_introduced);
    }
    try string(a, &out, b.label.value, b.label.introduced);
    inline for (.{ b.label.start, b.label.end }) |v| try int(a, &out, u32, @intCast(v));
    const body = try @import("chart-text-body-probe.zig").serialize(a, b.text, objects);
    defer a.free(body);
    try out.appendSlice(a, body);
    return out.toOwnedSlice(a);
}
fn string(a: std.mem.Allocator, out: *std.ArrayList(u8), s: core.hwp5.chart_value_object.String, introduced: bool) !void {
    inline for (.{ s.object_id, s.bytes.len, s.trailer, @intFromBool(introduced) }) |v| try int(a, out, u32, @intCast(v));
    try out.appendSlice(a, s.bytes);
}
