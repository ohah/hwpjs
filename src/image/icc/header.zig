const std = @import("std");
const version = @import("version.zig");
pub const size = 128;
pub const flags_offset = 44;
pub const intent_offset = 64;
pub const id_offset = 84;
pub const id_size = 16;
pub const V4Tail = struct { profile_id: [16]u8, reserved: [28]u8 };
pub const Tail = union(enum) { v2: [44]u8, v4: V4Tail };
/// Scalar/copy-only header fields. Date, flags, identifiers and fixed-point values
/// are preserved, not certified as valid ICC semantics by this wire parser.
pub const Header = struct {
    profile_size: u32,
    preferred_cmm: [4]u8,
    version: version.Version,
    profile_class: [4]u8,
    data_space: [4]u8,
    pcs: [4]u8,
    creation_date: [6]u16,
    file_signature: [4]u8,
    platform: [4]u8,
    flags: u32,
    manufacturer: [4]u8,
    model: [4]u8,
    attributes: u64,
    rendering_intent: u32,
    illuminant: [3]i32,
    creator: [4]u8,
    tail: Tail,
};
/// Exactly the header, not the enclosing profile. File-size matching, tag tables,
/// reserved fields, registry membership and profile-ID verification are separate.
pub fn parse(bytes: []const u8) !Header {
    if (bytes.len != size) return error.InvalidIccHeaderSize;
    const v = try version.parse(bytes[8..12]);
    if (!std.mem.eql(u8, bytes[36..40], "acsp")) return error.InvalidIccSignature;
    var date: [6]u16 = undefined;
    for (&date, 0..) |*value, i| value.* = std.mem.readInt(u16, bytes[24 + i * 2 ..][0..2], .big);
    var illuminant: [3]i32 = undefined;
    for (&illuminant, 0..) |*value, i| value.* = std.mem.readInt(i32, bytes[68 + i * 4 ..][0..4], .big);
    return .{
        .profile_size = std.mem.readInt(u32, bytes[0..4], .big),
        .preferred_cmm = bytes[4..8].*,
        .version = v,
        .profile_class = bytes[12..16].*,
        .data_space = bytes[16..20].*,
        .pcs = bytes[20..24].*,
        .creation_date = date,
        .file_signature = bytes[36..40].*,
        .platform = bytes[40..44].*,
        .flags = std.mem.readInt(u32, bytes[flags_offset..][0..4], .big),
        .manufacturer = bytes[48..52].*,
        .model = bytes[52..56].*,
        .attributes = std.mem.readInt(u64, bytes[56..64], .big),
        .rendering_intent = std.mem.readInt(u32, bytes[intent_offset..][0..4], .big),
        .illuminant = illuminant,
        .creator = bytes[80..84].*,
        .tail = if (v.major == 2) .{ .v2 = bytes[id_offset..size].* } else .{ .v4 = .{ .profile_id = bytes[id_offset..][0..id_size].*, .reserved = bytes[id_offset + id_size .. size].* } },
    };
}
