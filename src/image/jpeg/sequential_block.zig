const std = @import("std");
const Frame = @import("frame.zig").Frame;
const Table = @import("huffman.zig").Table;
const Huffman = @import("huffman_decoder.zig").Decoder;
const Bits = @import("entropy_bits.zig").Bits;
const Rules = @import("sequential_symbols.zig").Rules;
const amplitude = @import("amplitude.zig");

/// One sequential DCT block in wire zig-zag order. Predictor selection/reset,
/// MCU traversal, dequantization and IDCT are caller-owned later stages.
pub const Decoder = struct {
    rules: Rules,
    dc: Huffman,
    ac: Huffman,

    pub fn init(frame: Frame, dc: Table, ac: Table) !Decoder {
        const rules = try Rules.forFrame(frame);
        if (dc.class != 0 or ac.class != 1) return error.InvalidJpegHuffmanClass;
        try dc.validateForProcess(frame.process);
        try ac.validateForProcess(frame.process);
        return .{ .rules = rules, .dc = try Huffman.init(dc), .ac = try Huffman.init(ac) };
    }

    /// Input and externally supplied predictor remain unchanged on failure.
    /// Returned DC is the next predictor, with checked i32 accumulation.
    pub fn decode(self: *const Decoder, bits: *Bits, predictor: i32) ![64]i32 {
        var next = bits.*;
        const width = try self.rules.dc(try self.dc.decode(&next));
        const difference = try amplitude.receive(&next, width);
        var block: [64]i32 = @splat(0);
        block[0] = std.math.add(i32, predictor, difference) catch return error.InvalidJpegDcPredictor;
        var k: usize = 1;
        while (k < block.len) {
            const token = try self.rules.ac(try self.ac.decode(&next));
            switch (token.kind) {
                .end_of_block => break,
                .zero_run => {
                    if (token.zeros > block.len - k) return error.InvalidJpegAcRun;
                    k += token.zeros;
                },
                .coefficient => {
                    if (token.zeros >= block.len - k) return error.InvalidJpegAcRun;
                    k += token.zeros;
                    block[k] = try amplitude.receive(&next, token.width);
                    k += 1;
                },
            }
        }
        bits.* = next;
        return block;
    }
};
