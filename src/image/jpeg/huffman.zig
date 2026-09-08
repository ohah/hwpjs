const shared = @import("table_cursor.zig");
const lengths = @import("huffman_lengths.zig");
pub const Options = struct { cursor: shared.Options = .{}, max_symbols: usize = 256 };
pub const Table = struct {
    destination: u8,
    class: u8,
    bits: *const [16]u8,
    symbols: []const u8,
    unused_code_slots: u32,
    symbol_semantics_deferred: bool = true,
    /// Use-site constraints, not a symbol decoder or table installation state.
    pub fn validateForProcess(self: Table, process: @import("process.zig").Process) !void {
        if (process.coding != .huffman) return error.UnsupportedJpegHuffmanProcess;
        if (process.mode == .baseline and self.destination > 1) return error.InvalidJpegEntropySelector;
        if (process.mode == .lossless and self.class != 0) return error.InvalidJpegHuffmanClass;
    }
};
pub const Iterator = struct {
    cursor: shared.Cursor,
    max_symbols: usize,
    pub fn init(payload: []const u8, options: Options) !Iterator {
        return .{ .cursor = try shared.Cursor.init(payload, options.cursor), .max_symbols = options.max_symbols };
    }
    pub fn next(self: *Iterator) !?Table {
        var r = (try self.cursor.begin()) orelse return null;
        const s = try shared.selector(try r.readInt(u8));
        const bits = (try r.take(16))[0..16];
        const stats = try lengths.inspect(bits);
        if (stats.symbols > self.max_symbols) return error.LimitExceeded;
        const symbols = try r.take(stats.symbols);
        self.cursor.commit(r);
        return .{ .destination = s.destination, .class = s.high, .bits = bits, .symbols = symbols, .unused_code_slots = stats.unused_code_slots };
    }
};
