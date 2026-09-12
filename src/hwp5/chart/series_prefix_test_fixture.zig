const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const names = [_][]const u8{ "VtSeries\x00", "VtArray\x00", "VtCollection\x00", "VtObject\x00" };
pub const Fixture = struct {
    bytes: [768]u8 = @splat(0xa5),
    end: usize,
    raw: usize = 0,
    array: usize = 0,
    refs: [4]usize = undefined,
    name_offsets: [4]usize = undefined,
    versions: [4]usize = undefined,
    fn int(f: *Fixture, comptime T: type, n: T) void {
        std.mem.writeInt(T, f.bytes[f.end..][0..@sizeOf(T)], n, .little);
        f.end += @sizeOf(T);
    }
    fn typ(f: *Fixture, slot: usize, known: bool) void {
        f.refs[slot] = f.end;
        f.int(u32, @intCast(51 + slot * 19));
        if (!known) {
            f.int(u16, @intCast(names[slot].len));
            f.name_offsets[slot] = f.end;
            @memcpy(f.bytes[f.end..][0..names[slot].len], names[slot]);
            f.end += names[slot].len;
            f.versions[slot] = f.end;
            f.int(u16, if (slot == 0) 2 else 1);
        }
    }
};
pub fn make(start: usize, known: bool, first: u16, second: u16) Fixture {
    var f: Fixture = .{ .end = start };
    f.int(u32, 0);
    f.typ(0, known);
    f.raw = f.end;
    for (0..66) |i| f.int(u8, @truncate(i * 19 + 129));
    f.array = f.end;
    f.int(u32, 7);
    f.typ(1, known);
    f.int(u16, first);
    f.typ(2, known);
    f.int(u16, second);
    f.typ(3, known);
    return f;
}
pub fn seed(types: *Types) !void {
    const f = make(0, false, 0, 0);
    for (f.refs) |at| {
        var r: Reader = .{ .bytes = f.bytes[0..f.end], .offset = at };
        _ = try types.readObserved16(&r);
    }
}
