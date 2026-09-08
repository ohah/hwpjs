const Frame = @import("frame.zig").Frame;
const scan_parser = @import("scan.zig");
const Scan = scan_parser.Scan;
const Store = @import("table_store.zig").Store;
const q = @import("quantization.zig");
const h = @import("huffman.zig");

pub const Component = struct {
    id: u8,
    quantization: ?q.Table,
    dc: ?h.Table,
    ac: ?h.Table,
};
pub const Resolved = struct {
    scan: Scan,
    components: [4]Component,
    count: usize,
    /// Presence and use-site constraints are not entropy symbol validation.
    symbol_semantics_deferred: bool = true,
};

fn entropy(store: *const Store, frame: Frame, class: usize, destination: u8) !h.Table {
    const table = store.huffman[class][destination] orelse return error.MissingJpegHuffmanTable;
    try table.validateForProcess(frame.process);
    if (table.symbols.len == 0) return error.EmptyJpegHuffmanTable;
    return table;
}

/// Reuses the SOS parser; no table guessing, defaults, or implicit inheritance.
/// Does not certify cross-scan progression or progressive DQT lifetime.
pub fn resolve(store: *const Store, frame: Frame, payload: []const u8) !Resolved {
    const scan = try scan_parser.parse(payload, frame);
    if (frame.process.coding != .huffman) return error.UnsupportedJpegArithmeticTables;
    const progressive = frame.process.mode == .progressive;
    const needs_q = frame.process.mode != .lossless;
    const needs_dc = !progressive or (scan.spectral_start == 0 and scan.approximation_high == 0);
    const needs_ac = needs_q and (!progressive or scan.spectral_start != 0);
    var result: Resolved = .{ .scan = scan, .components = undefined, .count = scan.components.count() };
    for (0..result.count) |i| {
        const sc = scan.components.get(i).?;
        var qt: ?q.Table = null;
        if (needs_q) {
            for (0..frame.components.count()) |j| {
                const fc = frame.components.get(j).?;
                if (fc.id != sc.id) continue;
                qt = store.quantization[fc.quantization] orelse return error.MissingJpegQuantizationTable;
                try qt.?.validateForFrame(frame);
                break;
            }
        }
        result.components[i] = .{
            .id = sc.id,
            .quantization = qt,
            .dc = if (needs_dc) try entropy(store, frame, 0, sc.dc()) else null,
            .ac = if (needs_ac) try entropy(store, frame, 1, sc.ac()) else null,
        };
    }
    return result;
}
