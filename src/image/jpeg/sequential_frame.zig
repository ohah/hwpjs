const structure = @import("structure.zig");
const markers = @import("markers.zig");
const frame_parser = @import("frame.zig");
const scan_parser = @import("scan.zig");
const fields = @import("scan_fields.zig");
const Rules = @import("sequential_symbols.zig").Rules;
const Store = @import("table_store.zig").Store;
const Coverage = @import("sequential_coverage.zig").State;
const scan_decoder = @import("sequential_scan.zig");
const Quantization = @import("quantization.zig").Table;

pub const Options = struct { structure: structure.Options = .{}, max_blocks: usize = 4000000 };
/// The active table view survives later destination redefinitions as long as
/// the original immutable JPEG input remains alive.
pub const Block = struct { coefficients: scan_decoder.Coefficients, quantization: Quantization };

/// Whole non-hierarchical Huffman sequential image, streamed as quantized
/// zigzag blocks. Input/table views are borrowed; no implicit/default tables.
pub const Decoder = struct {
    boundaries: structure.Report,
    markers: markers.Iterator,
    options: Options,
    store: Store = .{},
    coverage: ?Coverage = null,
    active: ?scan_decoder.Decoder = null,
    pending: ?Coverage = null,
    scan_start: usize = 0,
    interval: u16 = 0,
    blocks: usize = 0,
    restarts: usize = 0,
    complete: bool = false,

    pub fn init(bytes: []const u8, options: Options) !Decoder {
        // The bounded structural pass resolves first-scan DNL height before
        // MCU geometry is needed, and validates marker ordering exactly once.
        return .{ .boundaries = try structure.inspect(bytes, options.structure), .markers = try markers.Iterator.init(bytes, options.structure.markers), .options = options };
    }

    /// Errors preserve this call's state. Earlier yielded blocks are not revoked.
    /// Only null after EOI certifies all component scans and final padding.
    pub fn next(self: *Decoder) !?Block {
        if (self.complete) return null;
        var next_state = self.*;
        const result = try next_state.advance();
        self.* = next_state;
        return result;
    }

    fn advance(self: *Decoder) !?Block {
        while (true) {
            if (self.active) |*active| {
                if (try active.next()) |block| {
                    const frame = self.coverage.?.frame;
                    const component = frame.components.get(block.frame_component).?;
                    const quantization = self.store.quantization[component.quantization].?;
                    self.blocks += 1;
                    return .{ .coefficients = block, .quantization = quantization };
                }
                self.markers.reader.offset = self.scan_start + active.reader.offset;
                self.restarts += active.restarts.count;
                self.coverage = self.pending;
                self.pending = null;
                self.active = null;
            }
            const marker = (try self.markers.next()) orelse return error.MissingJpegEoi;
            if (structure.isFrame(marker.code)) {
                const frame = try frame_parser.parse(marker.code, marker.payload, self.options.structure.frame);
                _ = try Rules.forFrame(frame);
                self.coverage = try Coverage.init(frame);
                continue;
            }
            switch (marker.code) {
                0xdb => try self.store.installQuantization(marker.payload, .{}),
                0xc4 => try self.store.installHuffman(marker.payload, .{}),
                0xdd => self.interval = try fields.restartInterval(marker.payload),
                0xda => {
                    var pending = self.coverage orelse return error.MissingJpegFrame;
                    const scan = try scan_parser.parse(marker.payload, pending.frame);
                    try pending.accept(scan);
                    self.scan_start = self.markers.reader.offset;
                    self.active = try scan_decoder.Decoder.init(pending.frame, marker.payload, &self.store, self.boundaries.effective_height, self.interval, self.markers.reader.bytes[self.scan_start..], .{ .max_bytes = self.options.structure.markers.max_bytes, .max_blocks = self.options.max_blocks - self.blocks, .max_restarts = self.options.structure.max_restarts - self.restarts });
                    self.pending = pending;
                },
                0xd9 => {
                    const coverage = self.coverage orelse return error.MissingJpegFrame;
                    try coverage.finish();
                    self.complete = true;
                    return null;
                },
                // Validated by the structural pass. DNL has already resolved
                // height; APP/COM/DAC payload meaning is not certified here.
                else => {},
            }
        }
    }
};
