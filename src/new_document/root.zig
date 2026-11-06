//! Deterministic new-document bytes. The caller owns and frees the result.
//! No source document, filesystem, clock, user profile or installed font lookup.
const std = @import("std");

pub fn hwp5(a: std.mem.Allocator) ![]u8 {
    return @import("hwp5.zig").create(a);
}

pub fn hwpx(a: std.mem.Allocator) ![]u8 {
    return @import("hwpx.zig").create(a);
}
