//! Test-only scalar digest; no XML grammar acceptance claim.
const std = @import("std");
const core = @import("hwpjs");
pub fn run(a: std.mem.Allocator, bytes: []const u8, max_characters: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const encoding: core.xml.input.Encoding = switch (try r.readInt(u8)) {
        0 => .utf8,
        1 => .utf16le,
        2 => .utf16be,
        else => return error.InvalidXmlEncoding,
    };
    const max_bytes = try r.readInt(u32);
    var input = try core.xml.input.Input.init(bytes[r.offset..], encoding, .{ .max_bytes = max_bytes, .max_characters = max_characters });
    return digest(a, &input);
}
pub fn digest(a: std.mem.Allocator, input: *core.xml.input.Input) ![]u8 {
    var count: u32 = 0;
    var hash: u32 = 2166136261;
    while (try input.next()) |c| {
        count += 1;
        hash = (hash ^ @as(u32, c.value)) *% 16777619;
    }
    const out = try a.alloc(u8, 12);
    for ([_]u32{ count, hash, @intCast(input.offset) }, 0..) |v, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], v, .little);
    return out;
}
