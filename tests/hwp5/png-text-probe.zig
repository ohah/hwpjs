const std = @import("std");
const core = @import("hwpjs");
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    const options: core.image.png_structure.Options = .{ .chunks = .{ .max_bytes = limit } };
    const r = try core.image.png_pixels.inspect(a, bytes, .{ .structure = options });
    const out = try a.alloc(u8, 20 + r.text_chunks * 8 + r.text_keyword_bytes + r.text_bytes);
    errdefer a.free(out);
    const fields = [_]usize{ r.text_chunks, r.text_keyword_bytes, r.text_bytes, r.structure.ancillary_chunks_deferred, r.structure.ancillary_bytes_deferred };
    for (fields, 0..) |v, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], @intCast(v), .little);
    var it = try core.image.png_structure.chunks.Iterator.init(bytes, options.chunks);
    var at: usize = 20;
    while (try it.next()) |c| if (c.is("tEXt")) {
        const value = try core.image.png_text.parse(c.payload);
        std.mem.writeInt(u32, out[at..][0..4], @intCast(value.keyword.len), .little);
        std.mem.writeInt(u32, out[at + 4 ..][0..4], @intCast(value.text.len), .little);
        at += 8;
        for ([_][]const u8{ value.keyword, value.text }) |part| {
            @memcpy(out[at..][0..part.len], part);
            at += part.len;
        }
    };
    return out;
}
