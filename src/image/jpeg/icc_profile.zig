const std = @import("std");
const extraction = @import("icc_extraction.zig");
const table = @import("../icc/tag_table.zig");
const id = @import("../icc/profile_id.zig");

pub const Options = struct {
    extraction: extraction.Options = .{},
    max_tags: usize = 100000,
    /// No implicit revision/layout or colour-model selection.
    layout: table.layout.Policy,
};
pub const Profile = struct {
    bytes: []u8,
    tags: table.Table,
    id_status: id.Status,
    chunk_count: u8,
    semantics_deferred: bool = true,

    pub fn deinit(self: *Profile, a: std.mem.Allocator) void {
        self.tags.deinit(a);
        a.free(self.bytes);
        self.* = undefined;
    }
};

/// Reassemble, validate existing ICC extent/table rules and the v4 profile ID.
/// Does not select a JPEG colour interpretation, inspect required tags or apply
/// an ICC transform. Tag views borrow the owned profile, never the JPEG input.
pub fn inspect(a: std.mem.Allocator, bytes: []const u8, options: Options) !?Profile {
    var extracted = try extraction.extract(a, bytes, options.extraction);
    errdefer extracted.deinit(a);
    const profile = extracted.profile_bytes orelse return null;
    var tags = try table.parse(a, profile, .{ .max_bytes = options.extraction.max_profile_bytes, .max_tags = options.max_tags, .policy = options.layout });
    errdefer tags.deinit(a);
    const status = try id.inspect(profile, options.extraction.max_profile_bytes);
    return .{ .bytes = profile, .tags = tags, .id_status = status, .chunk_count = extracted.chunk_count };
}
