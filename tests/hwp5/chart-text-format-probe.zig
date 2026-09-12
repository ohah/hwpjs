const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
// Test-only isolated format scope: prior types, optional code String seeds.
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    var input: core.Reader = .{ .bytes = bytes };
    const per = try input.readInt(u32);
    const count = try input.readInt(u32);
    const stored = try input.readInt(u32);
    const type_count = try input.readInt(u32);
    const string_count = try input.readInt(u32);
    var types = core.hwp5.chart_type_table.Table.init(a, .{});
    defer types.deinit();
    var objects = core.hwp5.chart_object_table.Table.init(a, .{ .max_objects = count, .max_total_string_bytes = stored });
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
    var reader: core.Reader = .{ .bytes = bytes[input.offset..] };
    const f = try core.hwp5.chart_text_format.readObservedV1(&reader, &types, &objects, per);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (.{ f.object_id, f.raw_word, f.code.object_id, f.code.bytes.len, f.code.trailer, @intFromBool(f.code_introduced), f.end, objects.entries.count(), objects.string_bytes }) |field| try int(a, &out, u32, @intCast(field));
    try out.appendSlice(a, f.code.bytes);
    return out.toOwnedSlice(a);
}
