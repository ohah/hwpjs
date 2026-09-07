const std = @import("std");
const core = @import("hwpjs");
pub fn run(a: std.mem.Allocator, input: []const u8, limit: usize) ![]u8 {
    if (input.len < 4) return error.UnexpectedEnd;
    const max_text = std.mem.readInt(u32, input[0..4], .little);
    const bytes = input[4..];
    const options: core.image.png_structure.Options = .{ .chunks = .{ .max_bytes = limit } };
    const r = try core.image.png_pixels.inspect(a, bytes, .{ .structure = options, .max_text_bytes = max_text });
    const out = try a.alloc(u8, 32 + (r.text_chunks + r.compressed_text_chunks) * 12 + r.text_keyword_bytes + r.text_bytes + r.compressed_text_keyword_bytes + r.compressed_text_bytes);
    errdefer a.free(out);
    const fields = [_]usize{ r.text_chunks, r.text_keyword_bytes, r.text_bytes, r.compressed_text_chunks, r.compressed_text_keyword_bytes, r.compressed_text_bytes, r.structure.ancillary_chunks_deferred, r.structure.ancillary_bytes_deferred };
    for (fields, 0..) |v, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], @intCast(v), .little);
    var it = try core.image.png_structure.chunks.Iterator.init(bytes, options.chunks);
    var at: usize = 32;
    while (try it.next()) |c| {
        if (c.is("tEXt")) {
            const v = try core.image.png_text.parse(c.payload);
            append(out, &at, 0, v.keyword, v.text);
        } else if (c.is("zTXt")) {
            var v = try core.image.png_compressed_text.decode(a, c.payload, max_text);
            defer v.deinit(a);
            append(out, &at, 1, v.keyword, v.text);
        }
    }
    return out;
}
fn append(out: []u8, at: *usize, kind: u32, key: []const u8, text: []const u8) void {
    std.mem.writeInt(u32, out[at.*..][0..4], kind, .little);
    std.mem.writeInt(u32, out[at.* + 4 ..][0..4], @intCast(key.len), .little);
    std.mem.writeInt(u32, out[at.* + 8 ..][0..4], @intCast(text.len), .little);
    at.* += 12;
    for ([_][]const u8{ key, text }) |part| {
        @memcpy(out[at.*..][0..part.len], part);
        at.* += part.len;
    }
}
