const std = @import("std");
const core = @import("hwpjs");
pub fn classes(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const c = try r.readInt(u32);
    const out = try a.alloc(u8, 4);
    std.mem.writeInt(u32, out[0..4], @as(u32, @intFromBool(core.xml.characters.nameStart(c))) | (@as(u32, @intFromBool(core.xml.characters.nameContinue(c))) << 1), .little);
    return out;
}
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const mode = try r.readInt(u8);
    const encoding: core.xml.input.Encoding = switch (try r.readInt(u8)) {
        0 => .utf8,
        1 => .utf16le,
        2 => .utf16be,
        else => return error.InvalidXmlEncoding,
    };
    const max_bytes = try r.readInt(u32);
    const max_name = try r.readInt(u32);
    var input = try core.xml.input.Input.init(bytes[r.offset..], encoding, .{ .max_characters = limit });
    var kind: u32 = 0;
    var point: u32 = 0;
    const raw = if (mode == 0) (try core.xml.names.parse(&input, max_bytes)).raw else if (mode == 1) blk: {
        const ref = try core.xml.references.parse(&input, .{ .max_bytes = max_bytes, .max_name_bytes = max_name });
        switch (ref.value) {
            .numeric => |c| {
                kind = 1;
                point = c;
            },
            .predefined => |c| {
                kind = 2;
                point = c;
            },
            .unresolved => kind = 3,
        }
        break :blk ref.raw;
    } else return error.InvalidMode;
    const out = try a.alloc(u8, 16 + raw.len);
    for ([_]u32{ kind, point, @intCast(input.offset), @intCast(input.remaining) }, 0..) |v, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], v, .little);
    @memcpy(out[16..], raw);
    return out;
}
