//! Actual HWP5 owner + generic chart values; never a synthetic HWPX pair or host.
const std = @import("std");
const common = @import("../../chart/display_values.zig");
pub const Snapshot = struct {
    section: u32,
    owner: @import("ole_sites.zig").Site,
    resource_sha256: [32]u8,
    physical_id: ?u16 = null,
    stream_entry: usize,
    legacy_backup_present: bool,
    presentation_streams: usize,
    values: common.Values,
    pub fn deinit(self: *Snapshot, a: std.mem.Allocator) void {
        self.values.deinit(a);
        self.* = undefined;
    }
};

/// Callers obtain owner and resource bytes from the same current HWP5 session.
/// Backups are read-only evidence; this does not authorize a synchronized edit.
pub fn read(a: std.mem.Allocator, section: u32, owner: @import("ole_sites.zig").Site, decoded: []const u8, layout: @import("../../ole/envelope.zig").Layout) !Snapshot {
    var resource = try @import("ooxml_resource.zig").read(a, decoded, layout);
    defer resource.deinit(a);
    const headers = try common.readHeaders(a, &resource.tree);
    return .{
        .section = section,
        .owner = owner,
        .resource_sha256 = resource.resource_sha256,
        .stream_entry = resource.stream_entry,
        .legacy_backup_present = resource.legacy_backup_present,
        .presentation_streams = resource.presentation_streams,
        .values = try common.collectBody(a, &resource.tree, headers, .{}),
    };
}
