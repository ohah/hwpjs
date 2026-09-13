const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
pub const Kind = enum { absent, alias, fresh, empty };
const names = [_][]const u8{ "VtSeriesPoint\x00", "VtSeriesLabel\x00", "VtTextBlock\x00", "VtFont\x00", "VtString\x00", "VtValue\x00", "VtObject\x00" };
pub const Fixture = struct {
    bytes: [1024]u8 = @splat(0x81),
    end: usize,
    label: usize = 0,
    font: usize = 0,
    raw: usize = 0,
    base: usize = 0,
    refs: [7]usize = undefined,
    versions: [7]usize = undefined,
    name_offsets: [7]usize = undefined,
    seen: [7]bool = @splat(false),
    known: bool,
    fn int(f: *Fixture, comptime T: type, n: T) void {
        std.mem.writeInt(T, f.bytes[f.end..][0..@sizeOf(T)], n, .little);
        f.end += @sizeOf(T);
    }
    fn typ(f: *Fixture, slot: usize) void {
        const first = !f.seen[slot];
        if (first) f.refs[slot] = f.end;
        f.int(u32, @intCast(51 + slot * 19));
        f.seen[slot] = true;
        if (f.known or !first) return;
        f.int(u16, @intCast(names[slot].len));
        f.name_offsets[slot] = f.end;
        @memcpy(f.bytes[f.end..][0..names[slot].len], names[slot]);
        f.end += names[slot].len;
        f.versions[slot] = f.end;
        f.int(u16, if (slot == 2) 2 else 1);
    }
    fn string(f: *Fixture, id: u32, len: u16) void {
        f.int(u32, id);
        f.typ(4);
        f.int(u16, len);
        f.end += len;
        f.int(u8, 173);
        f.typ(5);
        f.typ(6);
    }
};
pub fn make(start: usize, known: bool, kind: Kind) Fixture {
    var f: Fixture = .{ .end = start, .known = known };
    f.int(u32, 0);
    f.typ(0);
    f.label = f.end;
    f.int(u32, 7);
    f.typ(1);
    f.typ(2);
    f.end += 12;
    f.int(u32, 0xffffffff);
    f.font = f.end;
    f.int(u32, 10);
    f.typ(3);
    f.string(11, 2);
    f.end += 14;
    f.typ(6);
    f.end += 24;
    switch (kind) {
        .absent => f.int(u32, 0xffffffff),
        .alias => f.int(u32, 11),
        .fresh => f.string(12, 3),
        .empty => f.string(12, 0),
    }
    f.end += 26;
    f.typ(6);
    f.raw = f.end;
    f.end += 20;
    f.base = f.end;
    f.typ(6);
    return f;
}
pub fn seed(types: *Types) !void {
    const f = make(0, false, .fresh);
    for (f.refs) |at| {
        var r: Reader = .{ .bytes = f.bytes[0..f.end], .offset = at };
        _ = try types.readObserved16(&r);
    }
}
