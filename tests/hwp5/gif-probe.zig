const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const trailing = try r.readInt(u8);
    const max_bytes = try r.readInt(u32);
    const max_blocks = try r.readInt(u32);
    const max_sub = try r.readInt(u32);
    const max_frames = try r.readInt(u32);
    const max_pixels = try r.readInt(u32);
    const max_codes = try r.readInt(u32);
    if (trailing > 1) return error.InvalidMode;
    if (limit < 80) return error.LimitExceeded;
    var doc = try core.image.gif.decode(a, bytes[r.offset..], .{
        .structure = .{ .max_bytes = max_bytes, .max_blocks = max_blocks, .max_sub_blocks = max_sub, .allow_trailing_bytes = trailing == 1 },
        .max_frames = @min(max_frames, (limit - 80) / 72),
        .max_total_pixels = @min(max_pixels, limit - 80),
        .max_total_codes = max_codes,
    });
    defer doc.deinit(a);
    var size: usize = 80 + doc.header.global_palette.len;
    if (size > limit) return error.LimitExceeded;
    for (doc.frames) |f| {
        const part = 72 + f.image.local_palette.len + f.raster.indices.len;
        if (part > limit - size) return error.LimitExceeded;
        size += part;
    }
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try out.ensureTotalCapacity(a, size);
    const h = doc.header;
    for ([_]usize{ if (h.version == .gif87a) 87 else 89, h.width, h.height, h.flags, h.background, h.aspect, h.global_palette.len, doc.frames.len, doc.blocks, doc.sub_blocks, doc.total_pixels, doc.total_codes, doc.comments, doc.applications, doc.plain_texts, doc.unresolved_color_frames, doc.reserved_disposals, doc.consumed_bytes, doc.trailing_bytes, @intFromBool(doc.rendering_deferred) }) |n| try int(a, &out, u32, @intCast(n));
    try out.appendSlice(a, h.global_palette);
    for (doc.frames) |f| {
        const i = f.image;
        const p = f.raster;
        const c = i.control;
        for ([_]usize{ i.left, i.top, i.width, i.height, i.flags, i.local_palette.len, i.minimum_code_size, @intFromBool(c != null), if (c) |v| v.flags else 0, if (c) |v| v.delay else 0, if (c) |v| v.transparent_index else 0, p.indices.len, p.lzw.codes, p.lzw.clears, p.lzw.maximum_width, p.lzw.consumed_bytes, @intFromBool(p.lzw.initial_clear), @intFromBool(p.colors_resolved) }) |n| try int(a, &out, u32, @intCast(n));
        try out.appendSlice(a, i.local_palette);
        try out.appendSlice(a, p.indices);
    }
    return out.toOwnedSlice(a);
}
