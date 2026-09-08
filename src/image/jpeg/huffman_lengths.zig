pub const Stats = struct { symbols: usize, unused_code_slots: u32 };
/// Annex C canonical lengths: reject overfull trees and an all-ones code.
/// Empty/incomplete trees remain distinguishable from decodable symbol meaning.
pub fn inspect(bits: *const [16]u8) !Stats {
    var slots: u32 = 1;
    var symbols: usize = 0;
    for (bits) |count| {
        slots *= 2;
        if (count >= slots) return error.InvalidJpegHuffmanCodeSpace;
        slots -= count;
        symbols += count;
    }
    return .{ .symbols = symbols, .unused_code_slots = slots };
}
