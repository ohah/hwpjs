const std = @import("std");
const h = @import("header.zig");
const types = @import("types.zig");
const format = @import("format.zig");
const Allocation = @import("allocation.zig").Allocation;
pub fn read(a: std.mem.Allocator, allocation: *Allocation, entries: []types.Entry, options: types.Options) !void {
    const header = allocation.sectors.header;
    const root = &entries[0];
    if (root.size > options.max_stream_bytes) return error.LimitExceeded;
    const mini_stream = try allocation.chain(root.start, @intCast(root.size));
    const mini_bytes = if (header.mini_count == 0) &.{} else try allocation.chain(header.mini_start, @as(usize, header.mini_count) * header.sector_size);
    if (options.strict and header.mini_count != 0 and allocation.last_chain_sectors != header.mini_count) return error.InvalidMiniCount;
    const mini_used = try a.alloc(bool, mini_stream.len / format.mini_sector_size + @intFromBool(mini_stream.len % format.mini_sector_size != 0));
    @memset(mini_used, false);
    var total: usize = 0;
    for (entries) |*entry| {
        // read_directory in CFB 1.2.0 attaches content by allocation availability,
        // not just by entry kind or nonzero size (including unused/storage slots).
        entry.has_content = entry.kind != 5 and (format.usesFat(entry.size) or
            (root.start != h.end and root.start < allocation.sectors.count() and entry.start != h.end));
        if (entry.kind != 2) continue;
        if (entry.size > options.max_stream_bytes or entry.size > options.max_total_stream_bytes -| total)
            return error.LimitExceeded;
        const size: usize = @intCast(entry.size);
        total += size;
        if (size == 0) continue;
        if (format.usesFat(entry.size)) {
            entry.content = try allocation.chain(entry.start, size);
        } else {
            const out = try a.alloc(u8, size);
            var offset: usize = 0;
            var id = entry.start;
            while (offset < size) {
                if (id >= mini_used.len) return error.InvalidMiniSector;
                if (mini_used[id]) return error.CyclicOrSharedSector;
                mini_used[id] = true;
                const start = @as(usize, id) * format.mini_sector_size;
                const count = @min(size - offset, format.mini_sector_size);
                if (count > mini_stream.len - start) return error.TruncatedStream;
                @memcpy(out[offset..][0..count], mini_stream[start..][0..count]);
                offset += count;
                id = try h.int(u32, mini_bytes, @as(usize, id) * 4);
            }
            if (id != h.end) return error.InvalidMiniChain;
            entry.content = out;
        }
    }
    if (options.strict) {
        if (root.size % format.mini_sector_size != 0) return error.InvalidMiniChain;
        if (mini_used.len > mini_bytes.len / 4) return error.InvalidMiniChain;
        for (0..mini_bytes.len / 4) |i| {
            const value = try h.int(u32, mini_bytes, i * 4);
            if ((i >= mini_used.len or !mini_used[i]) and value != h.free) return error.UnclaimedMiniSector;
        }
    }
}
