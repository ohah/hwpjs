const std = @import("std");
const palette = @import("suggested_palette.zig");
const Chunk = @import("chunks.zig").Chunk;
pub const Stats = struct { chunks: usize = 0, name_bytes: usize = 0, entries: usize = 0, entries8: usize = 0, entries16: usize = 0, zero_frequencies: usize = 0, empty_palettes: usize = 0, payload_bytes: usize = 0 };
/// Owns the name index only. Keep chunk buffers immutable/alive until deinit.
pub const Collector = struct {
    names: std.StringHashMapUnmanaged(void) = .empty,
    stats: Stats = .{},
    data_seen: bool = false,
    pub fn deinit(self: *Collector, a: std.mem.Allocator) void {
        self.names.deinit(a);
        self.* = undefined;
    }
    pub fn consume(self: *Collector, a: std.mem.Allocator, chunk: Chunk) !void {
        if (chunk.is("IDAT")) {
            self.data_seen = true;
            return;
        }
        if (!chunk.is("sPLT")) return;
        if (self.data_seen) return error.InvalidPngSuggestedOrder;
        const v = try palette.parse(chunk.payload);
        if (self.names.contains(v.name)) return error.DuplicatePngSuggestedName;
        const count = v.count();
        const increment: Stats = .{ .chunks = 1, .name_bytes = v.name.len, .entries = count, .entries8 = if (v.depth == 8) count else 0, .entries16 = if (v.depth == 16) count else 0, .zero_frequencies = v.zero_frequencies, .empty_palettes = @intFromBool(count == 0), .payload_bytes = chunk.payload.len };
        var next = self.stats;
        inline for (std.meta.fields(Stats)) |f| @field(next, f.name) = std.math.add(usize, @field(next, f.name), @field(increment, f.name)) catch return error.LimitExceeded;
        try self.names.putNoClobber(a, v.name, {});
        self.stats = next;
    }
};
