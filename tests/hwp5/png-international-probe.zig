const std = @import("std");
const core = @import("hwpjs");
pub fn run(a: std.mem.Allocator, input: []const u8, limit: usize) ![]u8 {
    if (input.len < 12) return error.UnexpectedEnd;
    const options: core.image.png_international_text.Options = .{ .max_text_bytes = std.mem.readInt(u32, input[0..4], .little), .language = .{ .max_bytes = std.mem.readInt(u32, input[4..8], .little), .max_subtags = std.mem.readInt(u32, input[8..12], .little) } };
    const bytes = input[12..];
    const report = try core.image.png_pixels.inspect(a, bytes, .{ .max_text_bytes = options.max_text_bytes, .language = options.language, .structure = .{ .chunks = .{ .max_bytes = limit } } });
    const r = report.international_text;
    const out = try a.alloc(u8, 36 + r.chunks * 24 + r.keyword_bytes + r.language_bytes + r.translated_bytes + r.text_bytes);
    errdefer a.free(out);
    const fields = [_]usize{ r.chunks, r.keyword_bytes, r.language_bytes, r.translated_bytes, r.text_bytes, r.extension_semantics_deferred, r.discouraged_controls, r.translated_linefeeds, r.ignored_methods };
    for (fields, 0..) |v, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], @intCast(v), .little);
    var it = try core.image.png_structure.chunks.Iterator.init(bytes, .{ .max_bytes = limit });
    var at: usize = 36;
    while (try it.next()) |chunk| {
        if (!chunk.is("iTXt")) continue;
        var v = try core.image.png_international_text.decode(a, chunk.payload, options);
        defer v.deinit(a);
        const sizes = [_]usize{ @intFromBool(v.compressed), v.method, v.keyword.len, v.language.len, v.translated.len, v.text.len };
        for (sizes, 0..) |n, i| std.mem.writeInt(u32, out[at + i * 4 ..][0..4], @intCast(n), .little);
        at += 24;
        for ([_][]const u8{ v.keyword, v.language, v.translated, v.text }) |part| {
            @memcpy(out[at..][0..part.len], part);
            at += part.len;
        }
    }
    return out;
}
