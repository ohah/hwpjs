//! HWPX source color compatibility, not producer authentication.
//! Only exact observed identities and observed fields differ from standard RGB.
const std = @import("std");
const Version = @import("version_xml.zig").Version;
const rgb = @import("../model/rgb_color.zig");
pub const Encoding = enum { rgb24, colorref24 };
pub const Field = enum { win_brush_face_color, character_text_color, other };
pub const Profile = struct { id: []const u8 = "unknown", encoding: Encoding = .rgb24, verified: bool = false };
const old: Profile = .{ .id = "hangul-10.0.0.5060-xml1.2", .encoding = .colorref24, .verified = true };
const modern: Profile = .{ .id = "hangul-12.0.0.4426-xml1.5", .encoding = .rgb24, .verified = true };
fn equals(value: ?[]u8, expected: []const u8) bool {
    return if (value) |text| std.mem.eql(u8, text, expected) else false;
}
pub fn classify(value: ?*const Version) Profile {
    const v = value orelse return .{};
    if (v.major != 5 or v.minor != 1 or v.os != 1 or v.patch != null or v.revision != null or !equals(v.target_application, "WORDPROCESSOR") or !equals(v.application, "Hancom Office Hangul")) return .{};
    if (v.micro == 0 and v.build_number == 1 and equals(v.xml_version, "1.2") and equals(v.app_version, "10, 0, 0, 5060 WIN32LEWindows_8")) return old;
    if (v.micro == 1 and v.build_number == 0 and equals(v.xml_version, "1.5") and equals(v.app_version, "12, 0, 0, 4426 WIN32LEWindows_10")) return modern;
    return .{};
}
fn swaps(profile: Profile, field: Field) bool {
    return profile.encoding == .colorref24 and switch (field) {
        .win_brush_face_color, .character_text_color => true,
        .other => false,
    };
}
pub fn decodeNumber(profile: Profile, field: Field, raw: u32) !u32 {
    try rgb.validate(raw);
    return if (swaps(profile, field)) rgb.hwp5(raw) else raw;
}
/// null is unsupported/non-six-digit source, never a guessed black/alpha.
pub fn decode(profile: Profile, field: Field, raw: []const u8) ?u32 {
    const value = rgb.xml(raw) orelse return null;
    return if (swaps(profile, field)) rgb.hwp5(value) else value;
}
pub fn encodeNumber(profile: Profile, field: Field, canonical: u32) !u32 {
    try rgb.validate(canonical);
    return if (swaps(profile, field)) rgb.hwp5(canonical) else canonical;
}
pub fn encode(a: std.mem.Allocator, profile: Profile, field: Field, canonical: u32) ![]u8 {
    return rgb.format(a, try encodeNumber(profile, field, canonical));
}

pub const SemanticFaceColor = struct {
    node: usize,
    field: []const u8 = "winBrush.faceColor",
    rgb: ?u32,
};
