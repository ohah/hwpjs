//! Shared rectangle test in the stored picture's source coordinates.

pub const Rectangle = struct {
    left: i64,
    top: i64,
    right: i64,
    bottom: i64,

    pub fn fits(self: Rectangle, width: u32, height: u32) bool {
        return self.left >= 0 and self.top >= 0 and
            self.right > self.left and self.bottom > self.top and
            self.right <= width and self.bottom <= height;
    }
};

test "crop rectangle accepts full extent, one unit at the boundary and wide HWPX coordinates" {
    const expect = @import("std").testing.expect;
    try expect((Rectangle{ .left = 0, .top = 0, .right = 640, .bottom = 480 }).fits(640, 480));
    try expect((Rectangle{ .left = 639, .top = 479, .right = 640, .bottom = 480 }).fits(640, 480));
    try expect((Rectangle{ .left = 0, .top = 0, .right = 0xffffffff, .bottom = 1 }).fits(0xffffffff, 1));
}

test "crop rectangle rejects reversed, empty, negative and outside edges without arithmetic overflow" {
    const std = @import("std");
    const expect = std.testing.expect;
    try expect(!(Rectangle{ .left = 0, .top = 0, .right = 0, .bottom = 1 }).fits(1, 1));
    try expect(!(Rectangle{ .left = 0, .top = 1, .right = 1, .bottom = 0 }).fits(1, 1));
    try expect(!(Rectangle{ .left = -1, .top = 0, .right = 1, .bottom = 1 }).fits(1, 1));
    try expect(!(Rectangle{ .left = 0, .top = 0, .right = 1, .bottom = 1 }).fits(0, 1));
    try expect(!(Rectangle{ .left = 0, .top = 0, .right = 1, .bottom = 2 }).fits(1, 1));
    try expect(!(Rectangle{ .left = 0, .top = 0, .right = std.math.maxInt(i64), .bottom = 1 }).fits(0xffffffff, 1));
}
