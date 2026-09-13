const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const names = [_][]const u8{ "VtSeries\x00", "VtArray\x00", "VtCollection\x00", "VtObject\x00", "VtSeriesPoint\x00", "VtSeriesLabel\x00", "VtTextBlock\x00", "VtFont\x00", "VtString\x00", "VtValue\x00", "VtTextFormat\x00", "VtPicture\x00", "VtChartTitle\x00" };
pub const Row = struct { start: usize, prefix_end: usize, section_end: usize, suffix_end: usize, picture_end: usize, end: usize, first_word: usize, second_word: usize, suffix_text: usize };
pub const Fixture = struct {
    bytes: [32768]u8 = @splat(0xa5),
    end: usize,
    known: bool,
    rows: [3]Row = undefined,
    next_id: u32 = 0,
    title: usize = 0,
    last_text: usize = 0,
    refs: [13]usize = undefined,
    versions: [13]usize = undefined,
    name_offsets: [13]usize = undefined,
    seen: [13]bool = @splat(false),
    fn int(f: *Fixture, comptime T: type, n: T) void {
        std.mem.writeInt(T, f.bytes[f.end..][0..@sizeOf(T)], n, .little);
        f.end += @sizeOf(T);
    }
    fn raw(f: *Fixture, n: usize) void {
        for (f.bytes[f.end..][0..n], 0..) |*b, i| b.* = @truncate(i * 19 + f.end * 3 + 129);
        f.end += n;
    }
    fn object(f: *Fixture) void {
        f.int(u32, f.next_id);
        f.next_id += 1;
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
        f.int(u16, if (slot == 0 or slot == 6) 2 else 1);
    }
    fn body(f: *Fixture, absent: bool) void {
        f.typ(6);
        f.raw(12);
        f.int(u32, 0xffffffff);
        f.object();
        f.typ(7);
        f.int(u32, 999);
        f.raw(14);
        f.typ(3);
        f.raw(24);
        f.last_text = f.end;
        f.int(u32, if (absent) 0xffffffff else 999);
        f.raw(26);
        f.typ(3);
    }
    fn label(f: *Fixture, absent: bool) void {
        f.object();
        f.typ(5);
        f.body(absent);
    }
};
pub fn make(start: usize, known: bool, counts: []const usize) Fixture {
    var f: Fixture = .{ .end = start, .known = known };
    for (counts, 0..) |count, n| {
        const begin = f.end;
        f.object();
        f.typ(0);
        f.raw(66);
        f.object();
        f.typ(1);
        const first = f.end;
        f.int(u16, @intCast(count));
        f.typ(2);
        const second = f.end;
        f.int(u16, @intCast(count));
        f.typ(3);
        const prefix_end = f.end;
        for (0..count) |_| {
            f.object();
            f.typ(4);
            f.label(true);
            f.raw(20);
            f.typ(3);
        }
        f.raw(66);
        f.int(u32, 999);
        f.label(false);
        const section_end = f.end;
        f.object();
        f.body(false);
        const suffix_text = f.last_text;
        f.int(u16, 65535);
        for (0..2) |i| {
            f.object();
            f.typ(10);
            f.typ(3);
            f.int(u16, 0xaa55);
            f.int(u32, if (i == 0) 0xffffffff else 999);
        }
        const suffix_end = f.end;
        f.raw(40);
        f.object();
        f.typ(11);
        f.raw(4);
        f.int(u32, 0xffffffff);
        f.typ(3);
        const picture_end = f.end;
        f.raw(106);
        f.rows[n] = .{ .start = begin, .prefix_end = prefix_end, .section_end = section_end, .suffix_end = suffix_end, .picture_end = picture_end, .end = f.end, .first_word = first, .second_word = second, .suffix_text = suffix_text };
    }
    f.title = f.end;
    f.object();
    f.typ(12);
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
    try objects.registerString(.{ .object_id = 999, .bytes = &.{ 0xff, 0x80 }, .trailer = 173 });
}
