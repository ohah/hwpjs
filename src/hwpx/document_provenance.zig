//! Independent document provenance query; never conditional on Ruby/Dutmal/header features.
const std = @import("std");
const metadata = @import("source_version_metadata.zig");
const policy = @import("source_color_profile.zig");
const Session = @import("editor_session.zig").Session;
pub fn encode(a: std.mem.Allocator, session: *const Session) ![]u8 {
    var producer = try metadata.read(a, session.source, .{ .max_xml_bytes = @min(session.options.max_xml_bytes, 1024 * 1024), .max_attribute_bytes = 4096 });
    defer producer.deinit(a);
    const selected_profile = policy.classify(if (producer.sourceVersion) |*v| v else null);
    const bytes = try std.json.Stringify.valueAlloc(a, .{
        .sourceOnly = true,
        .sourceVersion = producer.sourceVersion,
        .sourceVersionError = producer.sourceVersionError,
        .sourceColorProfile = selected_profile,
    }, .{});
    errdefer a.free(bytes);
    if (bytes.len > session.options.max_output_bytes) return error.LimitExceeded;
    return bytes;
}
pub fn profile(session: *const Session) !policy.Profile {
    var producer = try metadata.read(session.allocator, session.source, .{ .max_xml_bytes = @min(session.options.max_xml_bytes, 1024 * 1024), .max_attribute_bytes = 4096 });
    defer producer.deinit(session.allocator);
    return policy.classify(if (producer.sourceVersion) |*v| v else null);
}
