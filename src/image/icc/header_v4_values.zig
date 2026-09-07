const std = @import("std");
const Header = @import("header.zig").Header;
const date = @import("date_time.zig");
const illuminant = @import("pcs_illuminant.zig");
const bits = @import("header_bits.zig");
pub const Report = struct {
    embedded: bool,
    independent_use_prohibited: bool,
    /// Bits reserved for ICC but not defined in the selected flags table.
    unassigned_icc_flags: u16,
    vendor_flags: u16,
    media_attributes: u4,
    vendor_attributes: u32,
    rendering_intent: u2,
};
/// ICC.1:2022 numeric/header-tail rules only. Identifiers, calendar validity,
/// registry membership, profile ID and tag semantics remain separate checks.
pub fn inspect(h: Header) !Report {
    if (h.version.major != 4) return error.IccEditionMismatch;
    const reserved = switch (h.tail) {
        .v4 => |tail| tail.reserved,
        .v2 => return error.IccEditionMismatch,
    };
    try date.validateComponents(h.creation_date);
    const attributes = bits.attributes(h.attributes);
    const flags = bits.flags(h.flags);
    if (attributes.unassigned_icc_attributes != 0) return error.InvalidIccAttributes;
    if (h.rendering_intent > 3) return error.InvalidIccRenderingIntent;
    try illuminant.validateV4(h.illuminant);
    if (!std.mem.allEqual(u8, &reserved, 0)) return error.InvalidIccHeaderReserved;
    return .{
        .embedded = flags.embedded,
        .independent_use_prohibited = flags.independent_use_prohibited,
        .unassigned_icc_flags = flags.unassigned_icc_flags,
        .vendor_flags = flags.vendor_flags,
        .media_attributes = attributes.media_attributes,
        .vendor_attributes = attributes.vendor_attributes,
        .rendering_intent = @intCast(h.rendering_intent),
    };
}
