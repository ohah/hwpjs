const Reader = @import("../../binary/reader.zig").Reader;
const Frame = @import("frame.zig").Frame;
const Store = @import("table_store.zig").Store;
const selection = @import("scan_tables.zig");
const Layout = @import("mcu_layout.zig").Layout;
const Block = @import("sequential_block.zig").Decoder;
const Bits = @import("entropy_bits.zig").Bits;
const transport = @import("scan_entropy.zig");
const Restart = @import("restarts.zig").State;
const Rules = @import("sequential_symbols.zig").Rules;

pub const Options = transport.Options;
pub const Coefficients = @import("coefficient_block.zig").Block;

/// Streaming coefficients for one complete sequential scan. Borrowed bytes start
/// after SOS and include a terminating marker, which remains unconsumed.
/// Caller owns the frame/table lifetime and cross-scan component coverage.
pub const Decoder = struct {
    layout: Layout,
    decoders: [4]Block,
    ids: [4]u8,
    predictors: [4]i32 = @splat(0),
    reader: Reader,
    bits: Bits,
    restarts: Restart,
    options: Options,
    emitted: u64 = 0,
    complete: bool = false,

    pub fn init(frame: Frame, scan_payload: []const u8, store: *const Store, height: u16, interval: u16, bytes: []const u8, options: Options) !Decoder {
        _ = try Rules.forFrame(frame);
        if (bytes.len > options.max_bytes) return error.LimitExceeded;
        const resolved = try selection.resolve(store, frame, scan_payload);
        const layout = try Layout.init(frame, resolved.scan, height, options.max_blocks);
        var reader: Reader = .{ .bytes = bytes };
        const bits = try transport.begin(&reader, options.max_bytes);
        var result: Decoder = .{ .layout = layout, .decoders = undefined, .ids = undefined, .reader = reader, .bits = bits, .restarts = .{ .interval = interval }, .options = options };
        for (0..resolved.count) |i| {
            const c = resolved.components[i];
            result.ids[i] = c.id;
            result.decoders[i] = try Block.init(frame, c.dc.?, c.ac.?);
        }
        result.restarts.beginScan();
        return result;
    }

    /// A failed next preserves all decoder state, including restart transitions.
    /// Prior successful outputs remain caller-owned; null certifies final padding.
    pub fn next(self: *Decoder) !?Coefficients {
        if (self.complete) return null;
        var next_state = self.*;
        const result = try next_state.advance();
        self.* = next_state;
        return result;
    }

    fn advance(self: *Decoder) !?Coefficients {
        if (self.emitted == self.layout.blocks) {
            try transport.finish(self.reader, &self.bits, &self.restarts, self.options);
            self.complete = true;
            return null;
        }
        if (transport.due(self.emitted, self.layout.count, self.restarts.interval)) {
            try transport.restart(&self.reader, &self.bits, &self.restarts, self.options);
            self.predictors = @splat(0);
        }
        const position = self.layout.position(self.emitted).?;
        const i = position.component;
        const values = try self.decoders[i].decode(&self.bits, self.predictors[i]);
        self.predictors[i] = values[0];
        self.emitted += 1;
        return .{ .component_id = self.ids[i], .frame_component = position.frame_component, .x = position.x, .y = position.y, .values = values };
    }
};
