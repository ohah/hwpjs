//! Deterministic new-document bytes. The caller owns and frees the result.
//! No source document, filesystem, clock, user profile or installed font lookup.
const std = @import("std");
pub const Hwp5Profile = @import("hwp5_profile.zig").Profile;

pub fn hwp5(a: std.mem.Allocator) ![]u8 {
    return @import("hwp5.zig").create(a);
}

/// An explicit legacy profile is for freshly authored compatibility documents,
/// never an instruction to reinterpret or upgrade an existing input document.
pub fn hwp5WithProfile(a: std.mem.Allocator, profile: Hwp5Profile) ![]u8 {
    return @import("hwp5.zig").createWithProfile(a, profile);
}

pub fn hwpx(a: std.mem.Allocator) ![]u8 {
    return @import("hwpx.zig").create(a);
}
