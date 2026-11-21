//! Explicit Source-only v1 contract. Not a public ABI or UI edit capability.
const std = @import("std");
pub const max_owners = 128;
pub const max_edits = @import("../../hwpx/chart_create_data.zig").max_points + @import("../../hwpx/chart_create_data.zig").max_categories;
pub const max_input_bytes = @import("../../hwpx/chart_create_data.zig").max_input_bytes;
pub const Target = struct { section: usize, owner: @import("ole_sites.zig").Site, physical_id: u16, resource_sha256: [32]u8 };
pub const Leaf = struct { category: u32, expected: []const u8, value: []const u8 };
pub const Edit = union(enum) {
    category: Leaf,
    value: struct { series: u32, category: u32, expected: []const u8, value: []const u8 },
};
pub const Plan = struct {
    profile: enum { spec24_clustered_column_literals_v1 },
    binding: @import("../../model/history_mutation_epoch.zig").Ticket,
    owners: []const Target,
    source_xml_sha256: [32]u8,
    edits: []const Edit,
};
pub const Request = struct { plan: Plan, rendered: ?@import("create_rendered_resources.zig").Payload = null };
pub fn validate(plan: Plan) !void {
    if (plan.owners.len == 0 or plan.owners.len > max_owners or plan.edits.len == 0 or plan.edits.len > max_edits) return error.LimitExceeded;
    var remaining: usize = max_input_bytes;
    for (plan.owners, 0..) |target, i| {
        if (target.owner.ole_layout != .spec24 or target.owner.attributes != 1 or target.owner.opaque_tail_bytes != 0 or target.owner.ordinal == 0 or target.owner.geometry.instance_id == 0) return error.UnsupportedChartLiteralEditOwner;
        if (target.physical_id != plan.owners[0].physical_id or !std.mem.eql(u8, &target.resource_sha256, &plan.owners[0].resource_sha256)) return error.UnsupportedChartLiteralEditMixedResource;
        for (plan.owners[0..i]) |prior| if (prior.section == target.section and prior.owner.control_node == target.owner.control_node) return error.DuplicateChartLiteralEditOwner;
    }
    for (plan.edits) |edit| {
        const expected, const value, const numeric = switch (edit) {
            .category => |v| .{ v.expected, v.value, false },
            .value => |v| .{ v.expected, v.value, true },
        };
        const limit: usize = if (numeric) 128 else @import("../../hwpx/chart_create_data.zig").max_text_bytes;
        if (expected.len > limit or value.len > limit) return error.LimitExceeded;
        if (!std.unicode.utf8ValidateSlice(expected) or !std.unicode.utf8ValidateSlice(value)) return error.InvalidUtf8;
        if (numeric) try @import("../../hwpx/chart_point_write.zig").validateNumeric(value);
        for ([2]usize{ expected.len, value.len }) |length| {
            if (length > remaining) return error.LimitExceeded;
            remaining -= length;
        }
    }
}
