const std = @import("std");
const envelope = @import("embedded_profile.zig");
const table = @import("../icc/tag_table.zig");
pub const Options = struct {
    envelope: envelope.Options = .{},
    max_tags: usize = 100000,
    /// Explicit layout policy, never inferred from an ICC major version.
    layout: table.layout.Policy,
    /// null means not selected, not no missing tags. Model must be explicit.
    required: ?@import("../icc/required_table.zig").Selection = null,
};
pub const Profile = struct {
    envelope: envelope.Envelope,
    table: table.Table,
    required: ?@import("../icc/required_table.zig").Report = null,
    /// Bounds and PNG color-space compatibility do not certify tag semantics.
    semantics_deferred: bool = true,
    pub fn deinit(self: *Profile, a: std.mem.Allocator) void {
        self.table.deinit(a);
        self.envelope.deinit(a);
        self.* = undefined;
    }
};
/// Color type 3 uses an RGB palette, not a one-channel grayscale profile.
pub fn validateColorSpace(h: @import("header.zig").Header, space: [4]u8) !void {
    try h.validate();
    const expected: [4]u8 = switch (h.color_type) {
        0, 4 => "GRAY".*,
        2, 3, 6 => "RGB ".*,
        else => unreachable,
    };
    if (!std.mem.eql(u8, &space, &expected)) return error.InvalidPngProfileColorSpace;
}
/// Caller owns PNG CRC, ordering, uniqueness and color-source selection.
/// Name borrows input; decompressed profile and table descriptors are owned.
pub fn inspect(a: std.mem.Allocator, h: @import("header.zig").Header, bytes: []const u8, options: Options) !Profile {
    try h.validate();
    var decoded = try envelope.decodeEnvelope(a, bytes, options.envelope);
    errdefer decoded.deinit(a);
    var tags = try table.parse(a, decoded.profile_bytes, .{ .max_bytes = options.envelope.max_profile_bytes, .max_tags = options.max_tags, .policy = options.layout });
    errdefer tags.deinit(a);
    try validateColorSpace(h, tags.header.data_space);
    const required = if (options.required) |selection| try @import("../icc/required_table.zig").inspect(&tags, selection) else null;
    return .{ .envelope = decoded, .table = tags, .required = required };
}
