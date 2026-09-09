const Reader = @import("../../binary/reader.zig").Reader;
const Frame = @import("frame.zig").Frame;
const Store = @import("table_store.zig").Store;
const selection = @import("scan_tables.zig");
const mcu = @import("mcu_layout.zig");
const block = @import("progressive_block.zig");
const Bits = @import("entropy_bits.zig").Bits;
const Restart = @import("restarts.zig").State;
const transport = @import("scan_entropy.zig");

pub const Options = transport.Options;
pub const Coefficients = @import("coefficient_block.zig").Block;

/// One Huffman progressive DCT scan. Input begins after SOS and includes a
/// terminal marker, left unconsumed. Borrowed frame/table/entropy bytes must
/// remain immutable and alive. The caller owns cross-scan History, quantization
/// lifetime and the prior coefficient grid, including interleaved padding.
pub const Decoder = struct {
    layout: mcu.Layout,
    decoders: [4]block.Decoder,
    ids: [4]u8,
    states: [4]block.State = @splat(.{}),
    selected: usize,
    reader: Reader,
    bits: Bits,
    restarts: Restart,
    options: Options,
    emitted: u64 = 0,
    complete: bool = false,

    pub fn init(frame: Frame, scan_payload: []const u8, store: *const Store, height: u16, interval: u16, bytes: []const u8, options: Options) !Decoder {
        if (frame.process.mode != .progressive or frame.process.coding != .huffman) return error.UnsupportedJpegProgressiveScan;
        if (bytes.len > options.max_bytes) return error.LimitExceeded;
        const resolved = try selection.resolve(store, frame, scan_payload);
        const layout = try mcu.Layout.init(frame, resolved.scan, height, options.max_blocks);
        var reader: Reader = .{ .bytes = bytes };
        const bits = try transport.begin(&reader, options.max_bytes);
        var result: Decoder = .{ .layout = layout, .decoders = undefined, .ids = undefined, .selected = resolved.count, .reader = reader, .bits = bits, .restarts = .{ .interval = interval }, .options = options };
        for (0..resolved.count) |i| {
            const c = resolved.components[i];
            result.ids[i] = c.id;
            result.decoders[i] = try block.Decoder.init(frame, scan_payload, if (resolved.scan.spectral_start == 0) c.dc else c.ac);
        }
        result.restarts.beginScan();
        return result;
    }

    /// Use this position to retrieve the matching prior block. Null only means
    /// there are no more blocks; next() must still certify EOB/padding/terminal.
    pub fn position(self: *const Decoder) ?mcu.Position {
        return self.layout.position(self.emitted);
    }

    /// Returns a new owned block without mutating prior. On any error all scan
    /// state is unchanged, including a restart already parsed in this call.
    /// After the last block, prior is ignored; null certifies scan completion.
    pub fn next(self: *Decoder, prior: [64]i32) !?Coefficients {
        if (self.complete) return null;
        var next_state = self.*;
        const result = try next_state.advance(prior);
        self.* = next_state;
        return result;
    }

    fn finishRuns(self: *const Decoder) !void {
        for (self.states[0..self.selected]) |state| try state.finish();
    }

    fn advance(self: *Decoder, prior: [64]i32) !?Coefficients {
        if (self.emitted == self.layout.blocks) {
            try self.finishRuns();
            try transport.finish(self.reader, &self.bits, &self.restarts, self.options);
            self.complete = true;
            return null;
        }
        if (transport.due(self.emitted, self.layout.count, self.restarts.interval)) {
            try self.finishRuns();
            try transport.restart(&self.reader, &self.bits, &self.restarts, self.options);
            self.states = @splat(.{});
        }
        const p = self.position().?;
        var values = prior;
        try self.decoders[p.component].decode(&self.bits, &self.states[p.component], &values);
        self.emitted += 1;
        return .{ .component_id = self.ids[p.component], .frame_component = p.frame_component, .x = p.x, .y = p.y, .values = values };
    }
};
