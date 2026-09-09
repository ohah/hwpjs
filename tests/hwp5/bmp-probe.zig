const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
fn fields(a: std.mem.Allocator, out: *std.ArrayList(u8), values: []const u32) !void {
    for (values) |value| try int(a, out, u32, value);
}
fn header(a: std.mem.Allocator, out: *std.ArrayList(u8), h: core.image.bmp_header.Header) !void {
    try fields(a, out, &.{ @intFromEnum(h.kind), h.width, h.height, @intFromBool(h.top_down), h.bit_count, @intFromEnum(h.compression), @intFromBool(h.info != null) });
    if (h.info) |v| try fields(a, out, &.{ v.image_bytes, @bitCast(v.x_resolution), @bitCast(v.y_resolution), v.colours_used, v.important_colours }) else try fields(a, out, &([_]u32{0} ** 5));
    try int(a, out, u32, @intFromBool(h.colour != null));
    if (h.colour) |v| {
        try fields(a, out, &v.masks);
        try int(a, out, u32, v.space);
        for (v.endpoints) |value| try int(a, out, i32, value);
        try fields(a, out, &v.gamma);
    } else try fields(a, out, &([_]u32{0} ** 17));
    try int(a, out, u32, @intFromBool(h.profile != null));
    if (h.profile) |v| try fields(a, out, &.{ v.intent, v.offset, v.size }) else try fields(a, out, &([_]u32{0} ** 3));
}
fn options(r: *core.Reader) !core.image.bmp_structure.Options {
    const pixels = try r.readInt(u64);
    const bytes = try r.readInt(u32);
    const palette = try r.readInt(u32);
    const storage = try r.readInt(u32);
    const trailing = try r.readInt(u8);
    if (trailing > 1) return error.InvalidMode;
    return .{ .header = .{ .max_pixels = pixels }, .max_bytes = bytes, .max_palette_entries = palette, .max_pixel_bytes = storage, .allow_trailing_bytes = trailing == 1 };
}
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize, mode: u32) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    if (mode == 285) {
        const pixels = try r.readInt(u64);
        try header(a, &out, try core.image.bmp_header.parse(bytes[r.offset..], .{ .max_pixels = pixels }));
    } else {
        const rgba = if (mode == 287) try r.readInt(u32) else 0;
        const selected = try options(&r);
        if (mode == 287) {
            var image = try core.image.bmp_pixels.decode(a, bytes[r.offset..], .{ .structure = selected, .colour_management = .unmanaged, .mask_scaling = .nearest_normalized, .max_rgba_bytes = @min(rgba, limit) });
            defer image.deinit(a);
            if (image.rgba.len > limit or limit - image.rgba.len < 16) return error.LimitExceeded;
            try fields(a, &out, &.{ image.width, image.height, @intCast(image.rgba.len), @intFromBool(image.metadata_deferred) });
            try out.appendSlice(a, image.rgba);
        } else {
            const view = try core.image.bmp_structure.inspect(bytes[r.offset..], selected);
            try header(a, &out, view.header);
            try fields(a, &out, &.{ view.file.size, view.file.pixels_offset, @intCast(view.stride), @intCast(view.pixels.len), @intCast(view.palette.count()), view.palette.entry_bytes, @intFromBool(view.channels != null) });
            try fields(a, &out, &(if (view.channels) |c| c.values else [_]u32{0} ** 4));
            try fields(a, &out, &.{ @intCast(view.gap.len), @intCast(view.after_pixels.len), @intCast(view.trailing.len), @intFromBool(view.metadata_deferred) });
            for ([_][]const u8{ view.palette.bytes, view.pixels, view.gap, view.after_pixels, view.trailing }) |part| {
                if (out.items.len > limit or part.len > limit - out.items.len) return error.LimitExceeded;
                try out.appendSlice(a, part);
            }
        }
    }
    if (out.items.len > limit) return error.LimitExceeded;
    return out.toOwnedSlice(a);
}
