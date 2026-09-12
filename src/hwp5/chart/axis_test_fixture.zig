const std = @import("std");
const values = @import("value_block_test_fixture.zig");
pub const TitleKind = enum { absent, empty, fresh, alias };
pub const Fixture = struct {
    bytes: [2048]u8 = @splat(0xa5),
    end: usize,
    seen: [9]bool = @splat(false),
    names: [9]usize = undefined,
    versions: [9]usize = undefined,
    count: usize = 0,
    raw: usize = 0,
    array_first: usize = 0,
    array_second: usize = 0,
    outer_first: usize = 0,
    outer_second: usize = 0,
    slots: usize = 0,
    scale_start: usize = 0,
    scale_end: usize = 0,
    title_start: usize = 0,
    title_end: usize = 0,
    text_start: usize = 0,
    name_start: usize = 0,
    total: usize = 2,
    stored: usize = 2,
    objects: u32 = 0,
    fn int(f: *Fixture, comptime T: type, n: T) void {
        std.mem.writeInt(T, f.bytes[f.end..][0..@sizeOf(T)], n, .little);
        f.end += @sizeOf(T);
    }
    fn object(f: *Fixture, id: u32) void {
        f.int(u32, id);
        f.objects += 1;
    }
    fn typ(f: *Fixture, slot: usize, name: []const u8, version: u16) void {
        f.int(u32, @intCast(10001 + slot * 19));
        if (f.seen[slot]) return;
        f.seen[slot] = true;
        f.int(u16, @intCast(name.len));
        f.names[f.count] = f.end;
        @memcpy(f.bytes[f.end..][0..name.len], name);
        f.end += name.len;
        f.versions[f.count] = f.end;
        f.int(u16, version);
        f.count += 1;
    }
    fn array(f: *Fixture, id: u32, first: u16, second: u16) void {
        f.object(id);
        f.typ(6, "VtArray\x00", 1);
        f.array_first = f.end;
        f.int(u16, first);
        f.typ(7, "VtCollection\x00", 1);
        f.array_second = f.end;
        f.int(u16, second);
        f.typ(5, "VtObject\x00", 1);
    }
};
pub fn make(scale: bool, long: bool, start: usize) Fixture {
    return makeTitle(scale, long, start, .alias);
}
pub fn makeTitle(scale: bool, long: bool, start: usize, kind: TitleKind) Fixture {
    var f: Fixture = .{ .end = start };
    f.object(1000);
    f.typ(0, "VtAxis\x00", 3);
    f.raw = f.end;
    f.end += 6;
    f.int(u16, @intFromBool(long));
    f.end += 74;
    f.title_start = f.end;
    f.object(1001);
    f.typ(1, "VtTextBlock\x00", 2);
    f.end += 12;
    f.int(u32, 0xffffffff);
    f.object(1002);
    f.typ(2, "VtFont\x00", 1);
    f.name_start = f.end;
    f.object(1003);
    f.typ(3, "VtString\x00", 1);
    f.int(u16, 2);
    f.int(u16, 0x80ff);
    f.int(u8, 173);
    f.typ(4, "VtValue\x00", 1);
    f.typ(5, "VtObject\x00", 1);
    f.end += 14;
    f.typ(5, "VtObject\x00", 1);
    f.end += 24;
    f.text_start = f.end;
    switch (kind) {
        .absent => f.int(u32, 0xffffffff),
        .alias => {
            f.int(u32, 1003);
            f.total += 2;
        },
        .empty, .fresh => {
            f.object(1007);
            f.typ(3, "VtString\x00", 1);
            const n: u16 = if (kind == .fresh) 3 else 0;
            f.int(u16, n);
            for (0..n) |_| f.int(u8, 0x81);
            f.int(u8, 99);
            f.typ(4, "VtValue\x00", 1);
            f.typ(5, "VtObject\x00", 1);
            f.total += n;
            f.stored += n;
        },
    }
    f.end += 26;
    f.typ(5, "VtObject\x00", 1);
    f.title_end = f.end;
    f.array(1004, @intFromBool(scale), @intFromBool(scale));
    f.outer_first = f.array_first;
    f.outer_second = f.array_second;
    if (scale) {
        f.scale_start = f.end;
        f.object(1005);
        f.typ(8, "VtAxisScaleBlock\x00", 1);
        f.array(1006, 5, 0);
        f.slots = f.end;
        for (0..5) |_| f.int(u32, 0xffffffff);
        const v = values.make(.number, true, 0);
        @memcpy(f.bytes[f.end..][0..v.end], v.bytes[0..v.end]);
        f.end += v.end;
        f.total += v.total;
        f.stored += v.stored;
        f.objects += v.objects;
        f.scale_end = f.end;
    }
    f.end += 36;
    if (long) f.end += 24;
    f.end += 14;
    f.typ(5, "VtObject\x00", 1);
    return f;
}
