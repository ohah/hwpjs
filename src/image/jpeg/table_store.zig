const q = @import("quantization.zig");
const h = @import("huffman.zig");
const cursor = @import("table_cursor.zig");
const std = @import("std");

/// Borrowed table definitions. All installed input buffers must remain immutable
/// and alive while this store or any resolved scan view is used.
pub const Store = struct {
    quantization: [4]?q.Table = @splat(null),
    huffman: [2][4]?h.Table = @splat(@splat(null)),

    /// A whole marker payload is atomic, including repeated destinations.
    pub fn installQuantization(self: *Store, payload: []const u8, options: cursor.Options) !void {
        _ = try self.installQuantizationTracked(payload, options);
    }

    /// Bits mark destinations altered at any point, even changed then restored
    /// within the same segment. Initial definitions are not alterations.
    pub fn installQuantizationTracked(self: *Store, payload: []const u8, options: cursor.Options) !u4 {
        var next = self.quantization;
        var changed: u4 = 0;
        var it = try q.Iterator.init(payload, options);
        while (try it.next()) |table| {
            if (next[table.destination]) |old| {
                if (old.precision != table.precision or !std.mem.eql(u8, old.raw, table.raw)) changed |= @as(u4, 1) << @as(u2, @intCast(table.destination));
            }
            next[table.destination] = table;
        }
        self.quantization = next;
        return changed;
    }

    pub fn installHuffman(self: *Store, payload: []const u8, options: h.Options) !void {
        var next = self.huffman;
        var it = try h.Iterator.init(payload, options);
        while (try it.next()) |table| next[table.class][table.destination] = table;
        self.huffman = next;
    }
};
