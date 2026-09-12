const std = @import("std");
pub const Kind = enum { absent, string, number, alias, number_alias };
pub const Fixture = struct {
    bytes: [1024]u8 = @splat(0xa5),
    end: usize,
    seen: [8]bool = @splat(false),
    names: [8]usize = undefined,
    versions: [8]usize = undefined,
    declarations: usize = 0,
    total: usize = 0,
    stored: usize = 0,
    objects: u32 = 0,
    reference: usize = 0,
    label: usize = 0,
    pub fn int(f: *Fixture, comptime T: type, value: T) void {
        std.mem.writeInt(T, f.bytes[f.end..][0..@sizeOf(T)], value, .little);
        f.end += @sizeOf(T);
    }
    fn typ(f: *Fixture, slot: usize, name: []const u8, version: u16) void {
        f.int(u32, @intCast(101 + slot * 19));
        if (f.seen[slot]) return;
        f.seen[slot] = true;
        f.int(u16, @intCast(name.len));
        f.names[f.declarations] = f.end;
        @memcpy(f.bytes[f.end..][0..name.len], name);
        f.end += name.len;
        f.versions[f.declarations] = f.end;
        f.int(u16, version);
        f.declarations += 1;
    }
    fn string(f: *Fixture, id: u32) void {
        f.int(u32, id);
        f.typ(1, "VtString\x00", 1);
        f.int(u16, 2);
        f.int(u16, 0x80ff);
        f.int(u8, 173);
        f.typ(2, "VtValue\x00", 1);
        f.typ(3, "VtObject\x00", 1);
        f.stored += 2;
        f.objects += 1;
    }
};
pub fn make(kind: Kind, with_format: bool, start: usize) Fixture {
    var f: Fixture = .{ .end = start };
    f.int(u32, 65536);
    f.typ(0, "VtValueBlock\x00", 1);
    f.reference = f.end;
    switch (kind) {
        .absent => f.int(u32, 0xffffffff),
        .string => {
            f.string(10);
            f.total += 2;
        },
        .alias => {
            f.int(u32, 10);
            f.total += 2;
            f.stored += 2;
            f.objects += 1;
        },
        .number => {
            f.int(u32, 10);
            f.typ(7, "VtDouble\x00", 1);
            f.int(u64, 0x7ff8000000001234);
            f.int(u16, 0xaa55);
            f.typ(2, "VtValue\x00", 1);
            f.typ(3, "VtObject\x00", 1);
            f.objects += 1;
        },
        .number_alias => {
            f.int(u32, 10);
            f.objects += 1;
        },
    }
    if (with_format) {
        f.int(u32, 20);
        f.objects += 1;
        f.typ(4, "VtTextFormat\x00", 1);
        f.typ(3, "VtObject\x00", 1);
        f.int(u16, 0x1234);
        if (kind == .string or kind == .alias) f.int(u32, 10) else f.string(21);
        f.total += 2;
    } else f.int(u32, 0xffffffff);
    f.int(u16, 0x4567);
    f.label = f.end;
    f.string(30);
    f.total += 2;
    f.int(u8, 0x81);
    f.int(u8, 0x23);
    f.int(u8, 0x45);
    f.typ(5, "VtTextBlock\x00", 2);
    f.end += 12;
    f.int(u32, 0xffffffff);
    f.int(u32, 40);
    f.objects += 1;
    f.typ(6, "VtFont\x00", 1);
    f.int(u32, 30); // Font name aliases the label.
    f.total += 2;
    f.end += 14;
    f.typ(3, "VtObject\x00", 1);
    f.end += 24;
    if (kind == .absent) f.int(u32, 0xffffffff) else {
        f.int(u32, 30);
        f.total += 2;
    }
    f.end += 26;
    f.typ(3, "VtObject\x00", 1);
    return f;
}
