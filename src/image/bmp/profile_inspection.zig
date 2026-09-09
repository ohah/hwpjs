const std = @import("std");
const transport = @import("profile_transport.zig");
const icc = @import("../icc/root.zig");
pub const Options = struct {
    transport: transport.Options = .{},
    max_tags: usize = 100000,
    layout: icc.tag_table.layout.Policy,
    required: ?icc.required_table.Selection = null,
    payloads: ?icc.payload_inspection.Options = null,
};
pub const Profile = struct {
    transport: transport.View,
    table: icc.tag_table.Table,
    id_status: icc.profile_id.Status,
    required: ?icc.required_table.Report,
    payloads: ?icc.payload_inspection.Report,
    semantics_deferred: bool = true,
    pub fn deinit(self: *Profile, a: std.mem.Allocator) void {
        self.table.deinit(a);
        self.* = undefined;
    }
};
/// Owns table descriptors only. All bytes/tag data borrow the original BMP.
/// Linked profiles are explicit unsupported inputs here, not absent profiles.
pub fn inspect(a: std.mem.Allocator, bytes: []const u8, options: Options) !?Profile {
    const envelope = (try transport.inspect(bytes, options.transport)) orelse return null;
    if (envelope.kind == .linked) return error.UnsupportedBmpLinkedProfile;
    var tags = try icc.tag_table.parse(a, envelope.data, .{ .max_bytes = options.transport.max_profile_bytes, .max_tags = options.max_tags, .policy = options.layout });
    errdefer tags.deinit(a);
    const status = try icc.profile_id.inspect(envelope.data, options.transport.max_profile_bytes);
    const required = if (options.required) |selection| try icc.required_table.inspect(&tags, selection) else null;
    const payloads = if (options.payloads) |selection| try icc.payload_inspection.inspect(a, &tags, selection) else null;
    return .{ .transport = envelope, .table = tags, .id_status = status, .required = required, .payloads = payloads };
}
