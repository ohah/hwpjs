const Header = @import("header.zig").Header;
const date = @import("date_time.zig");
const illuminant = @import("pcs_illuminant.zig");
const bits = @import("header_bits.zig");
pub const IlluminantPolicy = illuminant.V2Policy;
pub const Report = struct {
    flags: bits.Flags,
    attributes: bits.Attributes,
    rendering_intent: u2,
    /// v2 assigns the low 16 bits to ICC; interpretation of high bits is pending.
    intent_high_bits: u16,
    /// Header bytes 84..127, NOT a v4 ID/reserved-tail interpretation.
    nonzero_reserved_bytes: u8,
};
/// v2 component/known intent checks and explicit illuminant policy. Unknown
/// header bits and nonzero reserved bytes are diagnostics, not certified valid.
pub fn inspect(h: Header, policy: IlluminantPolicy) !Report {
    if (h.version.major != 2) return error.IccEditionMismatch;
    const reserved = switch (h.tail) {
        .v2 => |tail| tail,
        .v4 => return error.IccEditionMismatch,
    };
    try date.validateComponents(h.creation_date);
    const intent = h.rendering_intent & 0xffff;
    if (intent > 3) return error.InvalidIccRenderingIntent;
    try illuminant.validateV2(h.illuminant, policy);
    var count: u8 = 0;
    for (reserved) |byte| if (byte != 0) {
        count += 1;
    };
    return .{ .flags = bits.flags(h.flags), .attributes = bits.attributes(h.attributes), .rendering_intent = @intCast(intent), .intent_high_bits = @intCast(h.rendering_intent >> 16), .nonzero_reserved_bytes = count };
}
