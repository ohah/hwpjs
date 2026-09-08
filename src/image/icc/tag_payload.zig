const xyz = @import("xyz_tag.zig");
const trc = @import("trc_tag.zig");
const localized = @import("localized_tag.zig");
const adaptation = @import("chromatic_adaptation.zig");
pub const Result = union(enum) {
    xyz: xyz.Value,
    trc: trc.Parsed,
    localized: localized.Value,
    adaptation: adaptation.Value,
    /// Known family whose selected edition has no implemented parser.
    unsupported_edition,
    /// Unknown signature, including unimplemented LUT families.
    unhandled,
};
/// Signature-driven dispatch only. Known malformed payloads remain errors.
/// Borrowed views retain their owners' deferred flags; not whole-tag validity.
pub fn parse(signature: [4]u8, data: []const u8, edition: @import("edition.zig").Edition, options: @import("mluc.zig").Options) !Result {
    if (try xyz.parse(signature, data)) |value| return .{ .xyz = value };
    if (try trc.parse(signature, data, edition)) |value| return .{ .trc = value };
    const strings = localized.parse(signature, data, edition, options) catch |err| switch (err) {
        error.UnsupportedIccLocalizedEdition => return .unsupported_edition,
        else => return err,
    };
    if (strings) |value| return .{ .localized = value };
    const matrix = adaptation.parse(signature, data, edition) catch |err| switch (err) {
        error.UnsupportedIccAdaptationEdition => return .unsupported_edition,
        else => return err,
    };
    if (matrix) |value| return .{ .adaptation = value };
    return .unhandled;
}
