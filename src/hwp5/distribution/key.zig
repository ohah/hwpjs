// Distribution key derivation adapted from rhwp (MIT); see THIRD_PARTY_NOTICES.md.
const std = @import("std");
fn next(state: *u32) u32 {
    state.* = state.* *% 214013 +% 2531011;
    return (state.* >> 16) & 0x7fff;
}
pub fn derive(data: *const [@import("envelope.zig").data_size]u8) [16]u8 {
    var decoded = data.*;
    var state = std.mem.readInt(u32, data[0..4], .little);
    var left: u32 = 0;
    var mask: u8 = 0;
    for (&decoded, 0..) |*byte, i| {
        if (left == 0) {
            mask = @truncate(next(&state));
            left = (next(&state) & 15) + 1;
        }
        if (i >= 4) byte.* ^= mask;
        left -= 1;
    }
    const offset: usize = 4 + (decoded[0] & 15);
    return decoded[offset..][0..16].*;
}
