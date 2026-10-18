//! Conservative whole-source policy. Scoped protection is queried separately.
const std = @import("std");
pub fn validate(a: std.mem.Allocator, decoded: []const []const u8, version: @import("../version.zig").Version, section: usize) !void {
    try validateUnselected(a, decoded, version, section);
    try validateSelected(a, decoded[section], version);
}

pub fn validateUnselected(a: std.mem.Allocator, decoded: []const []const u8, version: @import("../version.zig").Version, section: usize) !void {
    if (section >= decoded.len) return error.InvalidSection;
    const policy = @import("source_policy.zig");
    for (decoded, 0..) |bytes, index| {
        if (index != section) try policy.validateUnselectedTextSection(a, bytes, version);
    }
}

pub fn validateSelected(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version) !void {
    const policy = @import("source_policy.zig");
    if (try policy.hasNamedFields(source)) {
        try policy.validateFieldTextTransaction(a, source, version);
        try @import("field_source_bindings.zig").validateText(a, source, version);
    } else _ = try policy.hasFormulas(a, source, version);
}
