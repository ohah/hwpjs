const Bits = @import("code_bits.zig").Reader;
const SubBlocks = @import("sub_blocks.zig").View;
pub const Evidence = struct {
    codes: usize = 0,
    clears: usize = 0,
    maximum_width: u4 = 0,
    consumed_bytes: usize = 0,
    initial_clear: bool = false,
};
/// Emits raw indices into the caller's sink. Dictionary and stack have fixed bounds.
pub fn decode(data: SubBlocks, minimum: u8, max_codes: usize, sink: anytype) !Evidence {
    if (minimum < 2 or minimum > 8) return error.InvalidGifCodeSize;
    const clear = @as(u16, 1) << @as(u4, @intCast(minimum));
    const end = clear + 1;
    var width: u4 = @intCast(minimum + 1);
    var next: u16 = clear + 2;
    var previous: ?u16 = null;
    var prefixes: [4096]u16 = undefined;
    var suffixes: [4096]u8 = undefined;
    var stack: [4096]u8 = undefined;
    var first: u8 = 0;
    var bits: Bits = .{ .chunks = data.iterator() };
    var report: Evidence = .{ .maximum_width = width };
    while (true) {
        if (report.codes == max_codes) return error.LimitExceeded;
        const code = try bits.read(width);
        if (report.codes == 0) report.initial_clear = code == clear;
        report.codes += 1;
        report.maximum_width = @max(report.maximum_width, width);
        if (code == clear) {
            report.clears += 1;
            width = @intCast(minimum + 1);
            next = clear + 2;
            previous = null;
            continue;
        }
        if (code == end) {
            // Only the unused bits of the final byte may follow EOI. Their value is unspecified.
            if (bits.bytes != data.payload_bytes) return error.TrailingGifLzwBytes;
            report.consumed_bytes = bits.bytes;
            return report;
        }
        if (code > next or (code == next and previous == null)) return error.InvalidGifLzwCode;
        var current = code;
        var count: usize = 0;
        if (code == next) {
            stack[count] = first;
            count += 1;
            current = previous.?;
        }
        while (current >= clear) {
            if (current < clear + 2 or current >= next or count == stack.len) return error.InvalidGifLzwCode;
            stack[count] = suffixes[current];
            count += 1;
            current = prefixes[current];
        }
        first = @intCast(current);
        if (count == stack.len) return error.InvalidGifLzwCode;
        stack[count] = first;
        count += 1;
        while (count != 0) {
            count -= 1;
            try sink.write(stack[count]);
        }
        if (previous) |old| {
            // Deferred clear: leave a full dictionary intact and keep reading 12-bit codes.
            if (next < 4096) {
                prefixes[next] = old;
                suffixes[next] = first;
                next += 1;
                if (next == @as(u16, 1) << width and width < 12) width += 1;
            }
        }
        previous = code;
    }
}
