const std = @import("std");
const Frame = @import("frame.zig").Frame;
const scan_parser = @import("scan.zig");
const Table = @import("huffman.zig").Table;
const Huffman = @import("huffman_decoder.zig").Decoder;
const Bits = @import("entropy_bits.zig").Bits;
const categories = @import("dct_categories.zig");
const amplitude = @import("amplitude.zig");
const values = @import("progressive_values.zig");
const ac = @import("progressive_ac.zig");

/// Predictor is in point-transformed units. EOB count excludes consumed blocks.
/// Caller owns one state per selected component/scan and resets at restart.
pub const State = struct {
    predictor: i32 = 0,
    eob_remaining: u16 = 0,

    pub fn finish(self: State) !void {
        if (self.eob_remaining != 0) return error.UnfinishedJpegEobRun;
    }
};

pub const Kind = enum { dc_first, dc_refine, ac_first, ac_refine };
pub const Decoder = struct {
    kind: Kind,
    start: u8,
    end: u8,
    step: i32,
    limits: categories.Limits,
    table: ?Huffman,

    /// Frame must have passed frame.parse. Scan grammar is reused here;
    /// cross-scan history, MCU traversal and restart framing remain external.
    pub fn init(frame: Frame, scan_payload: []const u8, table: ?Table) !Decoder {
        if (frame.process.mode != .progressive or frame.process.coding != .huffman) return error.UnsupportedJpegProgressiveBlock;
        const scan = try scan_parser.parse(scan_payload, frame);
        const kind: Kind = if (scan.spectral_start == 0) (if (scan.approximation_high == 0) .dc_first else .dc_refine) else (if (scan.approximation_high == 0) .ac_first else .ac_refine);
        var decoded: ?Huffman = null;
        if (kind != .dc_refine) {
            const h = table orelse return error.MissingJpegHuffmanTable;
            if (h.class != @as(u8, if (kind == .dc_first) 0 else 1)) return error.InvalidJpegHuffmanClass;
            try h.validateForProcess(frame.process);
            decoded = try Huffman.init(h);
        }
        return .{ .kind = kind, .start = scan.spectral_start, .end = scan.spectral_end, .step = @as(i32, 1) << @as(u5, @intCast(scan.approximation_low)), .limits = try categories.forPrecision(frame.precision), .table = decoded };
    }

    /// Failure changes none of the three caller-owned values, including a
    /// partially corrected block or a newly decoded multi-block EOB run.
    pub fn decode(self: *const Decoder, bits: *Bits, state: *State, block: *[64]i32) !void {
        var next_bits = bits.*;
        var next_state = state.*;
        var next_block = block.*;
        if (state.eob_remaining > 32767) return error.InvalidJpegEobRun;
        const initial = self.kind == .dc_first or self.kind == .ac_first;
        for (next_block[self.start .. @as(usize, self.end) + 1]) |value| {
            if (initial) {
                if (value != 0) return error.InvalidJpegInitialCoefficient;
            } else try values.validatePrior(value, self.step);
        }
        switch (self.kind) {
            .dc_first => {
                try state.finish();
                const size = try self.table.?.decode(&next_bits);
                if (size > self.limits.dc) return error.InvalidJpegDcCategory;
                next_state.predictor = std.math.add(i32, state.predictor, try amplitude.receive(&next_bits, size)) catch return error.InvalidJpegDcPredictor;
                next_block[0] = try values.scale(next_state.predictor, self.step);
            },
            .dc_refine => {
                try state.finish();
                next_block[0] = try values.refineDc(&next_bits, next_block[0], self.step);
            },
            .ac_first => try ac.first(&next_bits, &self.table.?, &next_block, &next_state.eob_remaining, self.start, self.end, self.step, self.limits.ac),
            .ac_refine => try ac.refine(&next_bits, &self.table.?, &next_block, &next_state.eob_remaining, self.start, self.end, self.step),
        }
        bits.* = next_bits;
        state.* = next_state;
        block.* = next_block;
    }
};
