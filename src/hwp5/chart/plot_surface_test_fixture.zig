const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
pub const Kind = enum { plot, surface };
pub const Fixture = struct {
    bytes: [768]u8 = @splat(0xa5),
    end: usize,
    id: usize = 0,
    before: usize = 0,
    raw: usize = 0,
    array: usize = 0,
    words: [2]usize = undefined,
    refs: [4]usize = undefined,
    names: [4]usize = undefined,
    versions: [4]usize = undefined,
    fn int(f: *Fixture, comptime T: type, value: T) void {
        std.mem.writeInt(T, f.bytes[f.end..][0..@sizeOf(T)], value, .little);
        f.end += @sizeOf(T);
    }
    fn typ(f: *Fixture, kind: Kind, slot: usize, known: bool) void {
        const names = [_][]const u8{ if (kind == .plot) "VtChartPlot\x00" else "VtSurfaceDesc\x00", "VtArray\x00", "VtCollection\x00", "VtObject\x00" };
        f.refs[slot] = f.end;
        f.int(u32, @intCast(51 + slot * 19));
        if (!known) {
            f.int(u16, @intCast(names[slot].len));
            f.names[slot] = f.end;
            @memcpy(f.bytes[f.end..][0..names[slot].len], names[slot]);
            f.end += names[slot].len;
            f.versions[slot] = f.end;
            f.int(u16, if (kind == .plot and slot == 0) 4 else 1);
        }
    }
    fn rawBytes(f: *Fixture, n: usize) void {
        for (0..n) |i| f.int(u8, @truncate(i * 19 + 129));
    }
};
pub fn make(kind: Kind, start: usize, known: bool, first: u16, second: u16) Fixture {
    var f: Fixture = .{ .end = start, .before = start };
    if (kind == .surface) f.rawBytes(30);
    f.id = f.end;
    f.int(u32, 0);
    f.typ(kind, 0, known);
    if (kind == .surface) {
        f.raw = f.end;
        f.rawBytes(46);
    }
    f.array = f.end;
    f.int(u32, 7);
    f.typ(kind, 1, known);
    f.words[0] = f.end;
    f.int(u16, first);
    f.typ(kind, 2, known);
    f.words[1] = f.end;
    f.int(u16, second);
    f.typ(kind, 3, known);
    if (kind == .plot) {
        f.raw = f.end;
        f.rawBytes(136);
    }
    return f;
}
pub fn seed(types: *Types, kind: Kind) !void {
    const f = make(kind, 0, false, 0, 0);
    for (f.refs) |at| {
        var reader: Reader = .{ .bytes = f.bytes[0..f.end], .offset = at };
        _ = try types.readObserved16(&reader);
    }
}
