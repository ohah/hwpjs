const Bits = @import("entropy_bits.zig").Bits;
const Huffman = @import("huffman_decoder.zig").Decoder;
const amplitude = @import("amplitude.zig");
const values = @import("progressive_values.zig");

/// Called on transaction-local bits, block and EOB state. Band is validated.
pub fn first(bits: *Bits, h: *const Huffman, block: *[64]i32, eob: *u16, start: usize, end: usize, step: i32, maximum: u8) !void {
    if (eob.* != 0) {
        eob.* -= 1;
        return;
    }
    var k = start;
    while (k <= end) {
        const symbol = try h.decode(bits);
        const run: usize = symbol >> 4;
        const size = symbol & 15;
        if (size == 0) {
            if (run != 15) {
                eob.* = try readEob(bits, @intCast(run)) - 1;
                return;
            }
            if (16 > end - k + 1) return error.InvalidJpegAcRun;
            k += 16;
        } else {
            if (size > maximum) return error.InvalidJpegAcSymbol;
            if (run > end - k) return error.InvalidJpegAcRun;
            k += run;
            block[k] = try values.scale(try amplitude.receive(bits, size), step);
            k += 1;
        }
    }
}

pub fn refine(bits: *Bits, h: *const Huffman, block: *[64]i32, eob: *u16, start: usize, end: usize, step: i32) !void {
    var k = start;
    if (eob.* == 0) {
        while (k <= end) {
            const symbol = try h.decode(bits);
            const run = symbol >> 4;
            const size = symbol & 15;
            var new_value: i32 = 0;
            if (size != 0) {
                if (size != 1) return error.InvalidJpegAcRefinementSymbol;
                new_value = if (try bits.read(1) == 1) step else -step;
            } else if (run != 15) {
                eob.* = try readEob(bits, run);
                break;
            }
            var zeros: usize = if (size == 0) 16 else run;
            while (k <= end) {
                if (block[k] != 0) {
                    block[k] = try values.refineAc(bits, block[k], step);
                    k += 1;
                } else if (zeros != 0) {
                    zeros -= 1;
                    k += 1;
                    // ZRL ends at its sixteenth zero. Corrections after that
                    // zero belong to the next symbol, not this ZRL.
                    if (size == 0 and zeros == 0) break;
                } else break;
            }
            if (zeros != 0) return error.InvalidJpegAcRun;
            if (size != 0) {
                if (k > end) return error.InvalidJpegAcRun;
                block[k] = new_value;
                k += 1;
            }
        }
    }
    if (eob.* != 0) {
        while (k <= end) : (k += 1) if (block[k] != 0) {
            block[k] = try values.refineAc(bits, block[k], step);
        };
        eob.* -= 1;
    }
}

fn readEob(bits: *Bits, width: u8) !u16 {
    // Callers distinguish F0/ZRL, so the width is at most fourteen.
    return @intCast((@as(u32, 1) << @as(u5, @intCast(width))) + try bits.read(@intCast(width)));
}
