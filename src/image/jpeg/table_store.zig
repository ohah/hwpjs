const q = @import("quantization.zig");
const h = @import("huffman.zig");
const cursor = @import("table_cursor.zig");

/// Borrowed table definitions. All installed input buffers must remain immutable
/// and alive while this store or any resolved scan view is used.
pub const Store = struct {
    quantization: [4]?q.Table = @splat(null),
    huffman: [2][4]?h.Table = @splat(@splat(null)),

    /// A whole marker payload is atomic, including repeated destinations.
    pub fn installQuantization(self: *Store, payload: []const u8, options: cursor.Options) !void {
        var next = self.quantization;
        var it = try q.Iterator.init(payload, options);
        while (try it.next()) |table| next[table.destination] = table;
        self.quantization = next;
    }

    pub fn installHuffman(self: *Store, payload: []const u8, options: h.Options) !void {
        var next = self.huffman;
        var it = try h.Iterator.init(payload, options);
        while (try it.next()) |table| next[table.class][table.destination] = table;
        self.huffman = next;
    }
};
