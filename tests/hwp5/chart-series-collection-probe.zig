const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
const Objects = core.hwp5.chart_object_table.Table;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var input: core.Reader = .{ .bytes = bytes };
    const max_objects = try input.readInt(u32);
    const count = try input.readInt(u32);
    if (count > 16) return error.LimitExceeded;
    var counts: [16]usize = undefined;
    for (counts[0..count]) |*n| n.* = try input.readInt(u32);
    var prefix = try @import("chart-post-line-prefix.zig").read(a, bytes[input.offset..], limit, max_objects);
    defer prefix.deinit();
    var c = try core.hwp5.chart_series_collection.readObserved(a, prefix.reader(), prefix.types(), prefix.objects(), counts[0..count], .{});
    defer c.deinit();
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (.{ c.items.len, c.end, c.title.object_id, c.title.end, prefix.types().definitions.count(), prefix.objects().entries.count(), prefix.objects().string_bytes }) |v| try int(a, &out, u32, @intCast(v));
    for (c.items) |s| {
        const p = s.prefix;
        inline for (.{ p.object_id, p.end, p.array.object_id, p.array.first_word, p.array.second_word, p.array.end }) |v| try int(a, &out, u32, @intCast(v));
        try out.appendSlice(a, &p.raw);
        try int(a, &out, u32, @intCast(s.section.points.len));
        for (s.section.points) |point| {
            try int(a, &out, u32, point.object_id);
            try int(a, &out, u32, @intCast(point.end));
            try out.appendSlice(a, &point.raw);
            try label(a, &out, point.label, prefix.objects());
        }
        try out.appendSlice(a, &s.section.raw);
        const ref = s.section.text;
        inline for (.{ ref.value.object_id, ref.value.bytes.len, ref.value.trailer, @intFromBool(ref.introduced), ref.start, ref.end }) |v| try int(a, &out, u32, @intCast(v));
        try out.appendSlice(a, ref.value.bytes);
        try label(a, &out, s.section.label, prefix.objects());
        const b = s.suffix.block;
        try int(a, &out, u32, b.object_id);
        try body(a, &out, .{ .prefix = b.prefix, .font = b.font, .middle = b.middle, .text = b.text, .suffix = b.suffix, .end = b.end, .backdrop = b.backdrop, .text_introduced = b.text_introduced }, prefix.objects());
        try int(a, &out, u32, s.suffix.raw_word);
        for (s.suffix.formats) |f| {
            inline for (.{ f.object_id, f.raw_word, @intFromBool(f.code != null), if (f.code) |v| v.object_id else 0xffffffff, if (f.code) |v| v.bytes.len else 0, if (f.code) |v| v.trailer else 0, @intFromBool(f.code_introduced), f.end }) |v| try int(a, &out, u32, @intCast(v));
            if (f.code) |v| try out.appendSlice(a, v.bytes);
        }
        inline for (.{ s.picture.picture.object_id, s.picture.picture.body.end, s.picture.picture.end, s.picture.end }) |v| try int(a, &out, u32, @intCast(v));
        try out.appendSlice(a, &s.picture.raw);
        try out.appendSlice(a, &s.picture.picture.body.raw);
        try out.appendSlice(a, &s.trailer);
        try int(a, &out, u32, @intCast(s.end));
    }
    return out.toOwnedSlice(a);
}
fn body(a: std.mem.Allocator, out: *std.ArrayList(u8), b: core.hwp5.chart_text_block_body.Body, objects: *const Objects) !void {
    const wire = try @import("chart-text-body-probe.zig").serialize(a, b, objects);
    defer a.free(wire);
    try out.appendSlice(a, wire);
}
fn label(a: std.mem.Allocator, out: *std.ArrayList(u8), l: core.hwp5.chart_series_label.Label, objects: *const Objects) !void {
    try int(a, out, u32, l.object_id);
    try int(a, out, u32, @intCast(l.end));
    try body(a, out, l.body, objects);
}
