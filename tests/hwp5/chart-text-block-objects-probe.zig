const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var input: core.Reader = .{ .bytes = bytes };
    const per = try input.readInt(u32);
    const total = try input.readInt(u32);
    const max_objects = try input.readInt(u32);
    var prefix = try @import("chart-light-prefix.zig").read(a, bytes[input.offset..], limit, 65535, max_objects);
    defer prefix.deinit();
    const reader = &prefix.previous.previous.reader;
    const types = &prefix.previous.previous.grid.prelude.types;
    const objects = &prefix.previous.objects;
    try objects.registerOther(try reader.readInt(u32));
    try core.hwp5.chart_type_checks.require(types, reader, "VtAxis\x00", 3);
    // Observed Axis prefix only; not a general 82-byte skip rule.
    _ = try reader.take(82);
    const block = try core.hwp5.chart_text_block.readObservedWithObjects(reader, types, objects, .{ .max_string_bytes = per, .max_total_string_bytes = total });
    const legacy = try @import("chart-text-block-probe.zig").serialize(a, block);
    defer a.free(legacy);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (.{ @intFromBool(block.font.name_introduced), @intFromBool(block.text_introduced), @intFromBool(block.backdrop != null), objects.entries.count(), objects.string_bytes }) |field|
        try int(a, &out, u32, @intCast(field));
    if (block.backdrop) |bd| {
        for (bd.object_ids) |id| try int(a, &out, u32, id);
        try int(a, &out, u32, @intCast(bd.end));
        try int(a, &out, u16, bd.fill_suffix);
        try out.appendSlice(a, &bd.raw_backdrop);
        try out.appendSlice(a, &bd.raw_fill);
        try out.appendSlice(a, &bd.raw_picture);
    }
    try out.appendSlice(a, legacy);
    return out.toOwnedSlice(a);
}
