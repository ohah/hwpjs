const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const names = [_][]const u8{ "VtObject\x00", "VtArray\x00", "VtCollection\x00" };
const ids = [_]u32{ 51, 97, 133 };
pub const Fixture = struct {
    bytes: [768]u8 = @splat(0xa5),
    end: usize,
    array: usize = 0,
    refs: [4]usize = undefined,
    name_offsets: [3]usize = undefined,
    versions: [3]usize = undefined,
    seen: [3]bool,
    count: usize = 0,
    fn int(f: *Fixture, comptime T: type, n: T) void {
        std.mem.writeInt(T, f.bytes[f.end..][0..@sizeOf(T)], n, .little);
        f.end += @sizeOf(T);
    }
    fn typ(f: *Fixture, slot: usize) void {
        f.refs[f.count] = f.end;
        f.count += 1;
        f.int(u32, ids[slot]);
        if (!f.seen[slot]) {
            f.int(u16, @intCast(names[slot].len));
            f.name_offsets[slot] = f.end;
            @memcpy(f.bytes[f.end..][0..names[slot].len], names[slot]);
            f.end += names[slot].len;
            f.versions[slot] = f.end;
            f.int(u16, 1);
            f.seen[slot] = true;
        }
    }
};
pub fn make(start: usize, known: bool, first: u16, second: u16) Fixture {
    var f: Fixture = .{ .end = start, .seen = @splat(known) };
    for (0..194) |i| f.int(u8, @truncate(i * 19 + 129));
    f.typ(0);
    f.array = f.end;
    f.int(u32, 0);
    f.typ(1);
    f.int(u16, first);
    f.typ(2);
    f.int(u16, second);
    f.typ(0);
    return f;
}
pub fn seed(types: *Types) !void {
    const f = make(0, false, 0, 0);
    for (f.refs[0..3]) |at| {
        var r: Reader = .{ .bytes = f.bytes[0..f.end], .offset = at };
        _ = try types.readObserved16(&r);
    }
}
