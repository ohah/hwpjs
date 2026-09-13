const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const names = [_][]const u8{ "VtPicture\x00", "VtObject\x00" };
pub const Fixture = struct {
    bytes: [512]u8 = @splat(0xa5),
    end: usize,
    picture: usize = 0,
    body: usize = 0,
    raw: usize = 0,
    data: usize = 0,
    refs: [2]usize = undefined,
    name_offsets: [2]usize = undefined,
    versions: [2]usize = undefined,
    fn int(f: *Fixture, comptime T: type, n: T) void {
        std.mem.writeInt(T, f.bytes[f.end..][0..@sizeOf(T)], n, .little);
        f.end += @sizeOf(T);
    }
    fn typ(f: *Fixture, slot: usize, known: bool) void {
        f.refs[slot] = f.end;
        f.int(u32, @intCast(51 + slot * 46));
        if (known) return;
        f.int(u16, @intCast(names[slot].len));
        f.name_offsets[slot] = f.end;
        @memcpy(f.bytes[f.end..][0..names[slot].len], names[slot]);
        f.end += names[slot].len;
        f.versions[slot] = f.end;
        f.int(u16, 1);
    }
};
pub fn make(start: usize, known: bool) Fixture {
    var f: Fixture = .{ .end = start };
    for (0..40) |i| f.int(u8, @truncate(129 + 19 * i));
    f.picture = f.end;
    f.int(u32, 0);
    f.body = f.end;
    f.typ(0, known);
    f.raw = f.end;
    f.int(u32, 0x80ff2345);
    f.data = f.end;
    f.int(u32, 0xffffffff);
    f.typ(1, known);
    return f;
}
pub fn seed(types: *Types) !void {
    const f = make(0, false);
    for (f.refs) |at| {
        var r: Reader = .{ .bytes = f.bytes[0..f.end], .offset = at };
        _ = try types.readObserved16(&r);
    }
}
