const std = @import("std");
const inspection = @import("profile_inspection.zig");
pub const Report = struct {
    profile_bytes: usize,
    tags: usize,
    version_major: u8,
    data_space: [4]u8,
    storage: @import("../icc/tag_layout.zig").Stats,
    required: ?@import("../icc/required_table.zig").Report = null,
    semantics_deferred: bool = true,
};
/// Scalar-only report: no decompressed backing survives a consume call.
pub const Collector = struct {
    report: ?Report = null,
    palette_seen: bool = false,
    data_seen: bool = false,
    pub fn consume(self: *Collector, a: std.mem.Allocator, h: @import("header.zig").Header, chunk: @import("chunks.zig").Chunk, options: inspection.Options) !void {
        if (chunk.is("PLTE")) self.palette_seen = true;
        if (chunk.is("IDAT")) self.data_seen = true;
        if (!chunk.is("iCCP")) return;
        if (self.report != null) return error.DuplicatePngProfile;
        if (self.palette_seen or self.data_seen) return error.InvalidPngProfileOrder;
        var profile = try inspection.inspect(a, h, chunk.payload, options);
        defer profile.deinit(a);
        self.report = .{
            .profile_bytes = profile.envelope.profile_bytes.len,
            .tags = profile.table.tags.len,
            .version_major = profile.table.header.version.major,
            .data_space = profile.table.header.data_space,
            .storage = profile.table.storage,
            .required = profile.required,
        };
    }
};
