const mluc = @import("mluc.zig");
pub const Kind = @import("localized_kind.zig").Kind;
pub const Value = struct {
    kind: Kind,
    strings: mluc.View,
    unicode_deferred: bool = true,
    locale_deferred: bool = true,
    extensions_deferred: bool,
};
/// v4 desc/cprt permitted type dispatch; unknown names are unhandled, not valid.
pub fn parse(signature: [4]u8, data: []const u8, edition: @import("edition.zig").Edition, options: mluc.Options) !?Value {
    const kind = @import("localized_kind.zig").identify(signature) orelse return null;
    if (edition != .v4_2022) return error.UnsupportedIccLocalizedEdition;
    const strings = try mluc.parse(data, options);
    return .{ .kind = kind, .strings = strings, .extensions_deferred = strings.stride != 12 };
}
