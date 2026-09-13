const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
pub const Kind = enum { absent, alias, fresh, empty };
const names = [_][]const u8{ "VtTextFormat\x00", "VtObject\x00", "VtString\x00", "VtValue\x00" };
pub const Fixture = struct {
    bytes: [512]u8 = @splat(0xa5),
    end: usize,
    code: usize = 0,
    word: usize = 0,
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
        if (known) return;
        f.int(u16, @intCast(names[slot].len));
        f.name_offsets[slot] = f.end;
        @memcpy(f.bytes[f.end..][0..names[slot].len], names[slot]);
        f.end += names[slot].len;
        f.versions[slot] = f.end;
        f.int(u16, 1);
    }
};
pub fn make(start: usize, known: bool, kind: Kind) Fixture {
    var f: Fixture = .{ .end = start };
    f.int(u32, 0);
    f.typ(0, known);
    f.typ(1, known);
    f.word = f.end;
    f.int(u16, 0xaa55);
    f.code = f.end;
    if (kind == .absent) f.int(u32, 0xffffffff) else {
        f.int(u32, 7);
        if (kind != .alias) {
            f.typ(2, known);
            f.int(u16, if (kind == .empty) 0 else 2);
            if (kind == .fresh) {
                f.int(u8, 255);
                f.int(u8, 128);
            }
            f.int(u8, 173);
            f.typ(3, known);
            f.int(u32, 70);
        }
    }
    return f;
}
pub fn seed(types: *Types) !void {
    const f = make(0, false, .fresh);
    for (f.refs) |at| {
        var r: Reader = .{ .bytes = f.bytes[0..f.end], .offset = at };
        _ = try types.readObserved16(&r);
    }
}
