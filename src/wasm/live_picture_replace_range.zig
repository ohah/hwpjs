//! Bound every external byte range before constructing a slice.
fn valid(ptr: [*]const u8, len: usize) bool {
    const maximum: u64 = @as(u64, @wasmMemorySize(0)) * 65536;
    const start: u64 = @intFromPtr(ptr);
    return start <= maximum and @as(u64, len) <= maximum - start;
}
pub fn validate(owner: [*]const u8, size: usize, image: [*]const u8, image_size: usize) !void {
    if (size == 0 or size > 16384 or image_size == 0 or image_size > @import("../model/picture_replacement.zig").max_image_bytes) return error.LimitExceeded;
    if (!valid(owner, size) or !valid(image, image_size)) return error.InvalidMemoryRange;
}
