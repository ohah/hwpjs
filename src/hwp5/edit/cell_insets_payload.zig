//! Fixed known LIST_HEADER/Cell payload only; all non-inset bytes stay verbatim.
const std = @import("std");
const lists = @import("../body/list_header.zig");
const semantic = @import("../../model/original_cell_insets.zig");
pub fn write(a: std.mem.Allocator, original: []const u8, layout: lists.Layout, expected_attributes: u32, after: semantic.Prepared, limit: usize) ![]u8 {
    if (original.len > limit) return error.LimitExceeded;
    const view = try (try lists.Header.parse(original)).view(layout);
    _ = try @import("../body/table_cell.zig").Cell.parse(view.extra);
    if (view.attributes != expected_attributes) return error.StaleCellInsets;
    if (view.attributes & (1 << 17) != 0) return error.ProtectedCell;
    const output = try a.dupe(u8, original);
    errdefer a.free(output);
    const attributes_at: usize = switch (layout) {
        .spec6 => 2,
        .observed8 => 4,
    };
    const mask: u32 = 1 << 16;
    const attributes = (view.attributes & ~mask) | (if (after.use_cell) mask else 0);
    std.mem.writeInt(u32, output[attributes_at..][0..4], attributes, .little);
    // Cell.parse owns the 16-byte geometry prefix; no raw-source offset is guessed.
    // Inherited mode retains the dormant physical bytes, including explicit values.
    if (after.use_cell) {
        const at = original.len - view.extra.len + 16;
        for (after.cell, 0..) |raw, i| {
            const value = raw orelse return error.UnknownCellInsets;
            if (value < 0 or value > std.math.maxInt(i16)) return error.UnsupportedCellInsets;
            std.mem.writeInt(i16, output[at + i * 2 ..][0..2], @intCast(value), .little);
        }
    }
    return output;
}
