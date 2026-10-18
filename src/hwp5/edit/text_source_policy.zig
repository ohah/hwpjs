//! Necessary immutable-source eligibility, not paragraph/range edit permission.
const std = @import("std");
pub fn validate(a: std.mem.Allocator, decoded: []const []const u8, version: @import("../version.zig").Version, section: usize) !void {
    if (section >= decoded.len) return error.InvalidSection;
    const policy = @import("source_policy.zig");
    for (decoded, 0..) |bytes, index| {
        if (index != section) try policy.validateUnselectedTextSection(a, bytes, version);
    }
    const source = decoded[section];
    if (try policy.hasNamedFields(source)) {
        try policy.validateFieldTextTransaction(a, source, version);
        try @import("field_source_bindings.zig").validateText(a, source, version);
    } else _ = try policy.hasFormulas(a, source, version);
}
