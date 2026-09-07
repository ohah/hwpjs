const std = @import("std");
const header = @import("header.zig");
const signatures = @import("signatures.zig");
/// Select the published identifier tables, not a claim about all revisions.
pub const Edition = @import("edition.zig").Edition;
pub const Report = struct {
    profile_class: signatures.ProfileClass,
    data_channels: u8,
    pcs_channels: u8,
    /// Nonzero CMM/manufacturer/model/creator fields: registry membership pending.
    registry_fields_deferred: u8,
};
/// Input is a parsed wire header. Does not validate scalar fields, ID or tags.
pub fn inspect(h: header.Header, edition: Edition) !Report {
    const expected: u8 = if (edition == .v2_2001) 2 else 4;
    if (h.version.major != expected) return error.IccEditionMismatch;
    const class = try signatures.profileClass(h.profile_class);
    const data_channels = try signatures.channels(h.data_space);
    if (class != .device_link and !signatures.isPcs(h.pcs)) return error.InvalidIccPcs;
    const pcs_channels = signatures.channels(h.pcs) catch return error.InvalidIccPcs;
    try signatures.platform(h.platform, edition == .v2_2001);
    var deferred: u8 = 0;
    for ([_][4]u8{ h.preferred_cmm, h.manufacturer, h.model, h.creator }) |value| {
        if (!std.mem.allEqual(u8, &value, 0)) deferred += 1;
    }
    return .{ .profile_class = class, .data_channels = data_channels, .pcs_channels = pcs_channels, .registry_fields_deferred = deferred };
}
