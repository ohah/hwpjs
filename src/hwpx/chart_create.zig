//! Detached creation profile. Main owns Session/history/ABI publication.
const std = @import("std");
const inline_insert = @import("inline_object_insert.zig");
const host = @import("chart_create_host.zig");
pub const Data = @import("chart_create_data.zig").Data;
pub const Series = @import("chart_create_data.zig").Series;
pub const ParsedRequest = @import("chart_create_request.zig").ParsedRequest;
pub const parseRequest = @import("chart_create_request.zig").parseRequest;
pub const Request = struct {
    expected_source_sha256: [32]u8,
    target: inline_insert.Target,
    size: host.Size,
    data: Data,
};
pub const Result = struct {
    bytes: []u8,
    ids: host.Identity,
    resource_index: u32,
    layout_requires_reflow: bool = true,
    preview_stale: bool = true,
    pub fn deinit(self: *Result, a: std.mem.Allocator) void {
        a.free(self.bytes);
        self.* = undefined;
    }
};

/// Immutable input in, independently owned ZIP candidate out. No Session writes.
pub fn prepare(a: std.mem.Allocator, input: []const u8, request: Request) !Result {
    return @import("chart_create_package.zig").prepare(a, input, request);
}
