const std = @import("std");
const Header = @import("header.zig").Header;
pub const lookup = @import("registry/lookup.zig");
pub const Report = struct { cmm: lookup.Status, manufacturer: lookup.Status, model: lookup.Status, creator: lookup.Status };
/// Snapshot membership only. No declaration that the whole profile is valid;
/// creator registration is a recommendation and is not promoted to an error.
pub fn inspect(h: Header) Report {
    const parent = code(h.manufacturer);
    return .{ .cmm = lookup.cmm(code(h.preferred_cmm)), .manufacturer = lookup.manufacturer(parent), .model = lookup.device(parent, code(h.model)), .creator = lookup.manufacturer(code(h.creator)) };
}
fn code(value: [4]u8) u32 {
    return std.mem.readInt(u32, &value, .big);
}
