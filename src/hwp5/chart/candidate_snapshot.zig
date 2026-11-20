//! Per-owner read observations only; generic OLE is never promoted to a chart.
const std = @import("std");
const Site = @import("ole_sites.zig").Site;
pub const State = enum { modern_chart, unresolved_ole, unavailable };
pub const Resource = struct {
    state: State,
    resource_sha256: ?[32]u8 = null,
    physical_id: ?u16 = null,
    stream_entry: ?usize = null,
    legacy_backup_present: ?bool = null,
    presentation_streams: ?usize = null,
    error_name: ?[]const u8 = null,
};
pub const Candidate = struct { section: u32, owner: Site, resource: Resource };
pub const max_sites = 4096;
pub const max_total_resource_bytes = 64 * 1024 * 1024;
/// One request-local resolver/cache is shared across every section in this query.
pub const Batch = struct {
    index: *const @import("../edit/binary_resource_index.zig").Index,
    resources: std.AutoHashMapUnmanaged(u16, Resource) = .empty,
    total: usize = 0,
    pub fn deinit(self: *Batch, a: std.mem.Allocator) void {
        self.resources.deinit(a);
        self.* = undefined;
    }
    pub fn append(self: *Batch, a: std.mem.Allocator, rows: *std.ArrayList(Candidate), section: u32, observations: []const Site) !void {
        if (observations.len > max_sites -| rows.items.len) return error.LimitExceeded;
        for (observations) |owner| {
            const entry = try self.resources.getOrPut(a, owner.ordinal);
            if (!entry.found_existing) entry.value_ptr.* = try inspect(a, self.index, owner.ordinal, &self.total);
            try rows.append(a, .{ .section = section, .owner = owner, .resource = entry.value_ptr.* });
        }
    }
};

fn inspect(a: std.mem.Allocator, index: *const @import("../edit/binary_resource_index.zig").Index, ordinal: u16, total: *usize) !Resource {
    if (ordinal == 0) return .{ .state = .unavailable, .error_name = "InvalidOleBinaryReference" };
    if (total.* >= max_total_resource_bytes) return .{ .state = .unavailable, .error_name = "LimitExceeded" };
    const bytes = index.read(a, ordinal, @min(@as(usize, 32 * 1024 * 1024), max_total_resource_bytes - total.*)) catch |err| {
        if (err == error.OutOfMemory) return err;
        return .{ .state = .unavailable, .error_name = @errorName(err) };
    };
    defer a.free(bytes);
    total.* += bytes.len;
    const physical = index.physicalId(ordinal) catch |err| return .{ .state = .unavailable, .error_name = @errorName(err) };
    var resource = @import("ooxml_resource.zig").read(a, bytes, .observed_size_prefix) catch |err| {
        if (err == error.OutOfMemory) return err;
        return .{ .state = if (err == error.ChartOOXMLUnavailable) .unresolved_ole else .unavailable, .error_name = @errorName(err) };
    };
    defer resource.deinit(a);
    return .{ .state = .modern_chart, .physical_id = physical, .resource_sha256 = resource.resource_sha256, .stream_entry = resource.stream_entry, .legacy_backup_present = resource.legacy_backup_present, .presentation_streams = resource.presentation_streams };
}
