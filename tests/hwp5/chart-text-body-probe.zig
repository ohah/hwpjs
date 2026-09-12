const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
// Test-only scope injection; not automatic chart routing or public ABI.
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    var input: core.Reader = .{ .bytes = bytes };
    const per = try input.readInt(u32);
    const total = try input.readInt(u32);
    const max_objects = try input.readInt(u32);
    const max_stored = try input.readInt(u32);
    const type_count = try input.readInt(u32);
    const string_count = try input.readInt(u32);
    const other_count = try input.readInt(u32);
    var types = core.hwp5.chart_type_table.Table.init(a, .{});
    defer types.deinit();
    var objects = core.hwp5.chart_object_table.Table.init(a, .{ .max_objects = max_objects, .max_total_string_bytes = max_stored });
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
    for (0..other_count) |_| try objects.registerOther(try input.readInt(u32));
    var reader: core.Reader = .{ .bytes = bytes[input.offset..] };
    const body = try core.hwp5.chart_text_block_body.readObservedV2(&reader, &types, &objects, .{ .max_string_bytes = per, .max_total_string_bytes = total });
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (.{ body.end, body.font.object_id, body.font.name.object_id, body.font.name.bytes.len, body.font.name.trailer, @intFromBool(body.font.name_introduced), @intFromBool(body.text != null), if (body.text) |s| s.object_id else 0xffffffff, if (body.text) |s| s.bytes.len else 0, if (body.text) |s| s.trailer else 0, @intFromBool(body.text_introduced), @intFromBool(body.backdrop != null), objects.entries.count(), objects.string_bytes }) |field|
        try int(a, &out, u32, @intCast(field));
    try out.appendSlice(a, &body.prefix);
    try out.appendSlice(a, &body.font.raw);
    try out.appendSlice(a, &body.middle);
    try out.appendSlice(a, &body.suffix);
    if (body.backdrop) |bd| {
        for (bd.object_ids) |id| try int(a, &out, u32, id);
        try int(a, &out, u32, @intCast(bd.end));
        try int(a, &out, u16, bd.fill_suffix);
        try out.appendSlice(a, &bd.raw_backdrop);
        try out.appendSlice(a, &bd.raw_fill);
        try out.appendSlice(a, &bd.raw_picture);
    }
    try out.appendSlice(a, body.font.name.bytes);
    if (body.text) |s| try out.appendSlice(a, s.bytes);
    return out.toOwnedSlice(a);
}
