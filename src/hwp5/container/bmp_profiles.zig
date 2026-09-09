const std = @import("std");
const transport = @import("../../image/bmp/profile_transport.zig");
const inspection = @import("../../image/bmp/profile_inspection.zig");
pub const Options = struct {
    max_profile_bytes: usize = (transport.Options{}).max_profile_bytes,
    max_link_bytes: usize = (transport.Options{}).max_link_bytes,
    /// Null inspects transport only; not an assertion of valid ICC content.
    content: ?inspection.ContentOptions = null,
    linked: enum { reject, preserve },
};
pub const Report = struct {
    embedded: usize = 0,
    linked: usize = 0,
    stored_bytes: usize = 0,
    icc_checked: usize = 0,
    icc_tags: usize = 0,
    id_verified: usize = 0,
    id_not_calculated: usize = 0,
    id_not_defined: usize = 0,
    content_deferred: usize = 0,
    required_checked: usize = 0,
    missing_tags: usize = 0,
    payloads_checked: usize = 0,
    unhandled_tags: usize = 0,
    pub fn plus(self: Report, other: Report) !Report {
        var result: Report = .{};
        inline for (std.meta.fields(Report)) |field| @field(result, field.name) = std.math.add(usize, @field(self, field.name), @field(other, field.name)) catch return error.LimitExceeded;
        return result;
    }
};
/// Original BMP structure owns file/header/pixel bounds. No path is opened.
pub fn inspect(a: std.mem.Allocator, view: @import("../../image/bmp/structure.zig").View, options: Options, remaining_bytes: usize) !Report {
    const maximum = @min(options.max_profile_bytes, remaining_bytes);
    const envelope = (try transport.fromView(view, .{ .max_profile_bytes = maximum, .max_link_bytes = @min(options.max_link_bytes, remaining_bytes) })) orelse return .{};
    if (envelope.stored_bytes > remaining_bytes) return error.LimitExceeded;
    var result: Report = .{ .stored_bytes = envelope.stored_bytes, .content_deferred = 1 };
    if (envelope.kind == .linked) {
        if (options.linked == .reject) return error.UnsupportedBmpLinkedProfile;
        result.linked = 1;
        return result;
    }
    result.embedded = 1;
    if (options.content) |selected| {
        var profile = try inspection.fromTransport(a, envelope, selected, maximum);
        defer profile.deinit(a);
        result.icc_checked = 1;
        result.icc_tags = profile.table.tags.len;
        switch (profile.id_status) {
            .verified => result.id_verified = 1,
            .not_calculated => result.id_not_calculated = 1,
            .not_defined => result.id_not_defined = 1,
        }
        if (profile.required) |required| {
            result.required_checked = 1;
            result.missing_tags = required.missing.count();
        }
        if (profile.payloads) |payloads| {
            result.payloads_checked = 1;
            result.unhandled_tags = payloads.unhandled + payloads.unsupported_edition;
        }
    }
    return result;
}
