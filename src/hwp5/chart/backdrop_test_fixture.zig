const std = @import("std");
pub const Fixture = struct {
    bytes: [256]u8 = @splat(0xa5),
    end: usize = 1,
    picture_data: usize = 0,
    base: usize = 0,
    second_id: usize = 0,
    third_id: usize = 0,
    fn int(self: *Fixture, comptime T: type, value: T) void {
        std.mem.writeInt(T, self.bytes[self.end..][0..@sizeOf(T)], value, .little);
        self.end += @sizeOf(T);
    }
    fn decl(self: *Fixture, id: u32, name: []const u8) void {
        self.int(u32, id);
        self.int(u16, @intCast(name.len));
        @memcpy(self.bytes[self.end..][0..name.len], name);
        self.end += name.len;
        self.int(u16, 1);
    }
};
pub fn make() Fixture {
    var f: Fixture = .{};
    f.int(u32, 0);
    f.decl(900, "VtBackdrop\x00");
    f.end += 50;
    f.second_id = f.end;
    f.int(u32, 123);
    f.decl(3, "VtFill\x00");
    f.end += 34;
    f.third_id = f.end;
    f.int(u32, 9);
    f.decl(77, "VtPicture\x00");
    f.end += 4;
    f.picture_data = f.end;
    f.int(u32, 0xffffffff);
    f.base = f.end;
    f.decl(51, "VtObject\x00");
    f.int(u16, 0x1234);
    f.int(u32, 51);
    f.int(u32, 51);
    return f;
}
