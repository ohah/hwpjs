const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
pub const Kind = enum { absent, alias, fresh, empty, font };
const names = [_][]const u8{ "VtChartTitle\x00", "VtChartText\x00", "VtTextBlock\x00", "VtFont\x00", "VtString\x00", "VtValue\x00", "VtObject\x00", "VtChartSection\x00", "VtBackdrop\x00", "VtFill\x00", "VtPicture\x00" };
pub const Fixture = struct {
    bytes: [8192]u8 = @splat(0xa5),
    end: usize,
    known: bool,
    next_id: u32 = 0,
    object_offsets: [16]usize = undefined,
    refs: [11]usize = undefined,
    names_at: [11]usize = undefined,
    versions: [11]usize = undefined,
    seen: [11]bool = @splat(false),
    body_start: usize = 0,
    block_id: u32 = 0,
    font_name: u32 = 0,
    text_at: usize = 0,
    section_start: usize = 0,
    section_raw: usize = 0,
    backdrop_start: usize = 0,
    backdrop_end: usize = 0,
    data_at: usize = 0,
    suffix_at: usize = 0,
    section_ids: [3]u32 = undefined,
    raw_backdrop: usize = 0,
    raw_fill: usize = 0,
    raw_picture: usize = 0,
    fn int(f: *Fixture, comptime T: type, n: T) void {
        std.mem.writeInt(T, f.bytes[f.end..][0..@sizeOf(T)], n, .little);
        f.end += @sizeOf(T);
    }
    fn raw(f: *Fixture, n: usize) void {
        for (f.bytes[f.end..][0..n], 0..) |*b, i| b.* = @truncate(i * 19 + f.end * 3 + 129);
        f.end += n;
    }
    fn object(f: *Fixture) u32 {
        const id = f.next_id;
        f.object_offsets[id] = f.end;
        f.int(u32, id);
        f.next_id += 1;
        return id;
    }
    fn typ(f: *Fixture, slot: usize) void {
        const first = !f.seen[slot];
        if (first) f.refs[slot] = f.end;
        f.int(u32, @intCast(31 + 37 * slot));
        f.seen[slot] = true;
        if (f.known or !first) return;
        f.int(u16, @intCast(names[slot].len));
        f.names_at[slot] = f.end;
        @memcpy(f.bytes[f.end..][0..names[slot].len], names[slot]);
        f.end += names[slot].len;
        f.versions[slot] = f.end;
        f.int(u16, if (slot == 2) 2 else 1);
    }
    fn string(f: *Fixture, n: u16) u32 {
        const id = f.object();
        f.typ(4);
        f.int(u16, n);
        f.raw(n);
        f.int(u8, 173);
        f.typ(5);
        f.typ(6);
        return id;
    }
    fn backdrop(f: *Fixture) void {
        f.backdrop_start = f.end;
        f.section_ids[0] = f.object();
        f.typ(8);
        f.raw_backdrop = f.end;
        f.raw(50);
        f.section_ids[1] = f.object();
        f.typ(9);
        f.raw_fill = f.end;
        f.raw(34);
        f.section_ids[2] = f.object();
        f.typ(10);
        f.raw_picture = f.end;
        f.raw(4);
        f.data_at = f.end;
        f.int(u32, 0xffffffff);
        f.typ(6);
        f.suffix_at = f.end;
        f.int(u16, 0xa55a);
        f.typ(6);
        f.typ(6);
        f.backdrop_end = f.end;
    }
};
pub fn make(start: usize, known: bool, kind: Kind, fresh_name: bool, auxiliary: bool) Fixture {
    var f: Fixture = .{ .end = start, .known = known };
    _ = f.object();
    f.typ(0);
    f.body_start = f.end;
    f.typ(1);
    f.block_id = f.object();
    f.typ(2);
    f.raw(12);
    if (auxiliary) f.backdrop() else f.int(u32, 0xffffffff);
    _ = f.object();
    f.typ(3);
    f.font_name = if (fresh_name) f.string(4) else blk: {
        f.int(u32, 997);
        break :blk 997;
    };
    f.raw(14);
    f.typ(6);
    f.raw(24);
    f.text_at = f.end;
    switch (kind) {
        .absent => f.int(u32, 0xffffffff),
        .alias => f.int(u32, 997),
        .fresh => _ = f.string(5),
        .empty => _ = f.string(0),
        .font => f.int(u32, f.font_name),
    }
    f.raw(26);
    f.typ(6);
    f.section_start = f.end;
    f.typ(7);
    f.section_raw = f.end;
    f.raw(26);
    f.backdrop();
    f.typ(6);
    return f;
}
pub fn seedTypes(types: *Types) !void {
    var f: Fixture = .{ .end = 0, .known = false };
    for (0..names.len) |i| f.typ(i);
    for (f.refs) |at| {
        var r: Reader = .{ .bytes = f.bytes[0..f.end], .offset = at };
        _ = try types.readObserved16(&r);
    }
}
pub fn seedObjects(objects: *Objects) !void {
    try objects.registerString(.{ .object_id = 997, .bytes = &.{ 0xff, 0x80, 1 }, .trailer = 173 });
    try objects.registerOther(999);
}
