const std = @import("std");
const core = @import("hwpjs");
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    const r = try core.image.png_pixels.inspect(a, bytes, .{ .structure = .{ .chunks = .{ .max_bytes = limit } } });
    const s = r.suggested_palettes;
    var size = try std.math.add(usize, 40, try std.math.mul(usize, s.chunks, 12));
    size = try std.math.add(usize, size, s.name_bytes);
    size = try std.math.add(usize, size, try std.math.mul(usize, s.entries, 10));
    const out = try a.alloc(u8, size);
    errdefer a.free(out);
    const fields = [_]usize{ s.chunks, s.name_bytes, s.entries, s.entries8, s.entries16, s.zero_frequencies, s.empty_palettes, s.payload_bytes, r.structure.ancillary_chunks_deferred, r.structure.ancillary_bytes_deferred };
    for (fields, 0..) |v, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], @intCast(v), .little);
    var it = try core.image.png_structure.chunks.Iterator.init(bytes, .{ .max_bytes = limit });
    var at: usize = 40;
    while (try it.next()) |chunk| {
        if (!chunk.is("sPLT")) continue;
        const v = try core.image.png_suggested_palette.parse(chunk.payload);
        for ([_]usize{ v.depth, v.name.len, v.count() }, 0..) |n, i| std.mem.writeInt(u32, out[at + i * 4 ..][0..4], @intCast(n), .little);
        at += 12;
        @memcpy(out[at..][0..v.name.len], v.name);
        at += v.name.len;
        for (0..v.count()) |i| {
            const e = v.get(i).?;
            for (e.rgba ++ [_]u16{e.frequency}, 0..) |n, j| std.mem.writeInt(u16, out[at + j * 2 ..][0..2], n, .little);
            at += 10;
        }
    }
    return out;
}
