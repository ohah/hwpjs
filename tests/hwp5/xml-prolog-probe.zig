const std = @import("std");
const core = @import("hwpjs");
pub fn run(a: std.mem.Allocator, bytes: []const u8, max_characters: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const external: ?core.xml.input.Encoding = switch (try r.readInt(u8)) {
        0 => null,
        1 => .utf8,
        2 => .utf16le,
        3 => .utf16be,
        else => return error.InvalidXmlEncoding,
    };
    const max_bytes = try r.readInt(u32);
    const max_declaration = try r.readInt(u32);
    var prolog = try core.xml.prolog.open(bytes[r.offset..], .{ .external_encoding = external, .input = .{ .max_bytes = max_bytes, .max_characters = max_characters }, .max_declaration_bytes = max_declaration });
    const start = prolog.input.offset;
    const digest = try @import("xml-input-probe.zig").digest(a, &prolog.input);
    defer a.free(digest);
    const out = try a.alloc(u8, 40);
    const d = prolog.declaration;
    const width: usize = if (prolog.input.encoding == .utf8) 1 else 2;
    const fields = [_]usize{
        @intFromEnum(prolog.input.encoding),                            prolog.bom_bytes,
        if (d) |v| v.raw.len else 0,                                    if (d) |v| v.version.raw.len / width else 0,
        if (d) |v| if (v.encoding) |n| n.raw.len / width else 0 else 0, if (d) |v| if (v.standalone) |s| if (s) 2 else 1 else 0 else 0,
        start,
    };
    for (fields, 0..) |v, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], @intCast(v), .little);
    @memcpy(out[28..], digest);
    return out;
}
