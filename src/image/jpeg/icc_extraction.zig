const std = @import("std");
const chunks = @import("icc_chunks.zig");
const structure = @import("structure.zig");
const markers = @import("markers.zig");

pub const Options = struct {
    structure: structure.Options = .{},
    max_profile_bytes: usize = chunks.max_profile_bytes,
};
pub const Result = struct {
    structure: structure.Report,
    chunk_count: u8,
    /// Owned reassembled bytes, not yet validated as an ICC profile.
    profile_bytes: ?[]u8,

    pub fn deinit(self: *Result, a: std.mem.Allocator) void {
        if (self.profile_bytes) |bytes| a.free(bytes);
        self.* = undefined;
    }
};

pub fn extract(a: std.mem.Allocator, bytes: []const u8, options: Options) !Result {
    var collector = chunks.Collector.init(options.max_profile_bytes);
    const report = try structure.inspectWithContext(bytes, options.structure, &collector, accept);
    return .{ .structure = report, .chunk_count = collector.count orelse 0, .profile_bytes = try collector.assemble(a) };
}

fn accept(collector: *chunks.Collector, marker: markers.Marker) !void {
    if (marker.code == 0xe2 and std.mem.startsWith(u8, marker.payload, chunks.identifier)) try collector.add(marker.payload);
}
