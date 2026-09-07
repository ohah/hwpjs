const std = @import("std");
pub const Encoding = @import("scalars.zig").Encoding;
pub const Selection = struct { encoding: Encoding, bom_bytes: usize, declaration_required: bool };
/// External encoding is an explicit caller contract, not a heuristic or fallback.
pub fn select(bytes: []const u8, external: ?Encoding) !Selection {
    inline for (.{ "\x00\x00\xfe\xff", "\xff\xfe\x00\x00", "\x00\x00\xff\xfe", "\xfe\xff\x00\x00", "\x00\x00\x00<", "<\x00\x00\x00", "\x00\x00<\x00", "\x00<\x00\x00", "\x4c\x6f\xa7\x94" }) |signature| {
        if (std.mem.startsWith(u8, bytes, signature)) return error.UnsupportedXmlEncoding;
    }
    const bom: ?Selection = if (std.mem.startsWith(u8, bytes, "\xef\xbb\xbf"))
        .{ .encoding = .utf8, .bom_bytes = 3, .declaration_required = false }
    else if (std.mem.startsWith(u8, bytes, "\xff\xfe"))
        .{ .encoding = .utf16le, .bom_bytes = 2, .declaration_required = false }
    else if (std.mem.startsWith(u8, bytes, "\xfe\xff"))
        .{ .encoding = .utf16be, .bom_bytes = 2, .declaration_required = false }
    else
        null;
    if (bom) |found| {
        if (external) |chosen| if (chosen != found.encoding) return error.XmlEncodingMismatch;
        return found;
    }
    if (external) |chosen| return .{ .encoding = chosen, .bom_bytes = 0, .declaration_required = false };
    if (std.mem.startsWith(u8, bytes, "<\x00?\x00")) return .{ .encoding = .utf16le, .bom_bytes = 0, .declaration_required = true };
    if (std.mem.startsWith(u8, bytes, "\x00<\x00?")) return .{ .encoding = .utf16be, .bom_bytes = 0, .declaration_required = true };
    return .{ .encoding = .utf8, .bom_bytes = 0, .declaration_required = false };
}
