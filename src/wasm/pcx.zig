//! Optional stateless PCX display decoder. Does not modify document sessions.
const a = @import("memory.zig").allocator;
const pixels = @import("../image/pcx/pixels.zig");
var image: ?pixels.Image = null;
fn fail(err: anyerror) u32 {
    _ = @import("cfb.zig").fail(err);
    return 0;
}
export fn pcx_rgba_free() void {
    if (image) |*value| value.deinit(a);
    image = null;
}
export fn pcx_decode_rgba(ptr: [*]const u8, size: usize, max_pixels: usize) u32 {
    pcx_rgba_free();
    if (size > 64 * 1024 * 1024 or max_pixels == 0 or max_pixels > 16_000_000) return fail(error.LimitExceeded);
    image = pixels.decode(a, ptr[0..size], .{ .max_pixels = max_pixels }) catch |err| return fail(err);
    return 1;
}
export fn pcx_rgba_ptr() usize {
    return if (image) |value| @intFromPtr(value.rgba.ptr) else 0;
}
export fn pcx_rgba_len() usize {
    return if (image) |value| value.rgba.len else 0;
}
export fn pcx_rgba_width() usize {
    return if (image) |value| value.width else 0;
}
export fn pcx_rgba_height() usize {
    return if (image) |value| value.height else 0;
}
