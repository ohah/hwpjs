const std = @import("std");
pub const Unwritten = enum { reject, palette_zero, transparent };
pub const RleEvidence = struct {
    unwritten: Unwritten,
    written_pixels: usize,
    unwritten_pixels: usize,
    commands: usize,
    consumed_bytes: usize,
    trailing_bytes: usize,
};
pub const Image = struct {
    width: u32,
    height: u32,
    /// Owned top-down RGBA; no compositing, colour management or gamma.
    rgba: []u8,
    metadata_deferred: bool = true,
    rle: ?RleEvidence = null,
    pub fn deinit(self: *Image, a: std.mem.Allocator) void {
        a.free(self.rgba);
        self.* = undefined;
    }
};
/// Shared output preflight, before any uncompressed or RLE decoder allocation.
pub fn byteCount(width: u32, height: u32, limit: usize) !usize {
    const pixels = @as(u64, width) * height;
    if (pixels > limit / 4) return error.LimitExceeded;
    return @as(usize, @intCast(pixels)) * 4;
}
