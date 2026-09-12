const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var input: core.Reader = .{ .bytes = bytes };
    const max_name = try input.readInt(u32);
    const max_objects = try input.readInt(u32);
    const max_stored = try input.readInt(u32);
    var prefix = try @import("chart-footnote-prefix.zig").read(a, bytes[input.offset..], limit);
    defer prefix.deinit();
    const footnote = try core.hwp5.chart_footnote.readObservedV1(&prefix.reader, &prefix.grid.prelude.types, .{});
    var objects = core.hwp5.chart_object_table.Table.init(a, .{ .max_objects = max_objects, .max_total_string_bytes = max_stored });
    defer objects.deinit();
    // Only established objects are registered; opaque root/grid prefix words
    // are not guessed to be object IDs. Caller retains the complete Contents.
    for (prefix.grid.cells) |cell| switch (cell.value) {
        .empty => {},
        .number => try objects.registerOther(cell.object_id.?),
        .string => |s| try objects.registerString(.{ .object_id = cell.object_id.?, .bytes = s.bytes, .trailer = s.trailer }),
    };
    for (prefix.backdrop.object_ids) |id| try objects.registerOther(id);
    for ([_]u32{ footnote.object_id, footnote.block.object_id, footnote.block.font.object_id } ++ footnote.section.backdrop.object_ids) |id|
        try objects.registerOther(id);
    try objects.registerString(footnote.block.font.name);
    try objects.registerString(footnote.block.text);
    const value = try core.hwp5.chart_legend.readObservedV1(&prefix.reader, &prefix.grid.prelude.types, &objects, max_name);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (.{ value.end, value.object_id, value.font.object_id, value.font.name.object_id, @intFromBool(value.font.name_introduced), value.font.name.bytes.len, value.font.name.trailer, objects.entries.count(), objects.string_bytes }) |field|
        try int(a, &out, u32, @intCast(field));
    for (value.section.backdrop.object_ids) |id| try int(a, &out, u32, id);
    try int(a, &out, u16, value.section.backdrop.fill_suffix);
    try out.appendSlice(a, &value.font.raw);
    try out.appendSlice(a, &value.raw);
    try out.appendSlice(a, &value.section.raw);
    try out.appendSlice(a, &value.section.backdrop.raw_backdrop);
    try out.appendSlice(a, &value.section.backdrop.raw_fill);
    try out.appendSlice(a, &value.section.backdrop.raw_picture);
    try out.appendSlice(a, value.font.name.bytes);
    return out.toOwnedSlice(a);
}
