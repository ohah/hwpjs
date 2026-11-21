//! Pure source payload plan, not a Session mutation or an authority issuer.
const std = @import("std");
const lists = @import("../body/list_header.zig");
const alignment = @import("../../model/cell_vertical_alignment.zig");
pub const Observation = struct { attributes: u32, value: ?alignment.Alignment };
pub fn observe(payload: []const u8, layout: lists.Layout) !Observation {
    const view = try (try lists.Header.parse(payload)).view(layout);
    _ = try @import("../body/table_cell.zig").Cell.parse(view.extra);
    return .{ .attributes = view.attributes, .value = alignment.fromRaw(view.alignment()) };
}
pub fn write(a: std.mem.Allocator, payload: []const u8, layout: lists.Layout, expected_attributes: u32, desired: alignment.Alignment, limit: usize) !?[]u8 {
    if (payload.len > limit) return error.LimitExceeded;
    const before = try observe(payload, layout);
    if (before.attributes != expected_attributes) return error.StaleCellVerticalAlignment;
    const previous = before.value orelse return error.UnsupportedCellVerticalAlignment;
    if (before.attributes & (1 << 17) != 0) return error.ProtectedCell;
    if (previous == desired) return null;
    const result = try a.dupe(u8, payload);
    const at: usize = switch (layout) {
        .spec6 => 2,
        .observed8 => 4,
    };
    const after = (before.attributes & ~@as(u32, 0x60)) | (@as(u32, @backingInt(desired)) << 5);
    std.mem.writeInt(u32, result[at..][0..4], after, .little);
    return result;
}
