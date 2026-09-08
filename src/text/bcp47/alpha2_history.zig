const std = @import("std");
const registry = @import("registry_data.zig");
const data = @import("data/alpha2_history.zig");
pub const Kind = enum { language, region };
pub const Report = struct { registered: bool, deprecated_on: ?[]const u8 = null, preferred: ?[]const u8 = null };
/// IANA metadata only: no rewriting, ISO validity or recursive canonicalization.
/// Registration and comparisons use the existing BCP 47 case-insensitive rules.
pub fn inspect(kind: Kind, code: [2]u8) Report {
    const registered = registry.contains(if (kind == .language) .language else .region, &code);
    if (!registered) return .{ .registered = false };
    const entries: []const data.Entry = if (kind == .language) &data.language else &data.region;
    for (entries) |entry| if (std.ascii.eqlIgnoreCase(&entry.code, &code)) return .{ .registered = true, .deprecated_on = entry.deprecated, .preferred = entry.preferred };
    return .{ .registered = true };
}
