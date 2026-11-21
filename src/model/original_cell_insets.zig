//! One semantic owner for source-cell insets; format adapters retain physical bytes.
const std = @import("std");
pub const Source = struct { use_cell: ?bool, cell: [4]?i64, table: [4]?i64 };
pub const Frame = struct { width: u32, height: u32 };
/// Axis order is left, right, top, bottom. null means untouched, never zero.
pub const Patch = union(enum) { inherit, custom: [4]?u32 };
pub const Prepared = struct { use_cell: bool, cell: [4]?i64, effective: [4]u32, changed: bool };
fn axis(raw: ?i64) !u32 {
    const value = raw orelse return error.UnknownCellInsets;
    if (value < 0 or value > std.math.maxInt(i16)) return error.UnsupportedCellInsets;
    return @intCast(value);
}
fn inner(frame: Frame, values: [4]u32) !void {
    if (frame.width == 0 or frame.height == 0 or @as(u64, values[0]) + values[1] >= frame.width or @as(u64, values[2]) + values[3] >= frame.height) return error.InvalidCellInsetsInnerBox;
}
pub fn effective(source: Source, frame: Frame) ![4]u32 {
    const own = source.use_cell orelse return error.UnknownCellInsets;
    // Initial common profile requires explicit four-axis raw declarations in both owners.
    for (source.cell) |raw| {
        const value = raw orelse return error.UnknownCellInsets;
        if (value < std.math.minInt(i16) or value > std.math.maxInt(i16)) return error.UnsupportedCellInsets;
    }
    var inherited: [4]u32 = undefined;
    for (source.table, 0..) |raw, i| inherited[i] = try axis(raw);
    var result = inherited;
    if (own) for (source.cell, 0..) |raw, i| {
        result[i] = try axis(raw);
    };
    try inner(frame, result);
    return result;
}
pub fn prepare(source: Source, frame: Frame, patch: Patch) !Prepared {
    const before = try effective(source, frame);
    var own: bool = undefined;
    var cells = source.cell;
    var result = before;
    switch (patch) {
        .inherit => {
            own = false;
            for (source.table, 0..) |raw, i| result[i] = try axis(raw);
        },
        .custom => |values| {
            own = true;
            for (values, 0..) |raw, i| {
                const value = raw orelse before[i];
                if (value > std.math.maxInt(i16)) return error.UnsupportedCellInsets;
                result[i] = value;
                cells[i] = value;
            }
        },
    }
    try inner(frame, result);
    return .{ .use_cell = own, .cell = cells, .effective = result, .changed = own != source.use_cell.? or !std.meta.eql(cells, source.cell) };
}

test "original cell insets shared inherited sparse axis retains effective defaults" {
    const source: Source = .{ .use_cell = false, .cell = .{ 10, 20, 30, 40 }, .table = .{ 144, 288, 432, 576 } };
    const result = try prepare(source, .{ .width = 10000, .height = 4000 }, .{ .custom = .{ 720, null, null, null } });
    try std.testing.expectEqualDeep([4]u32{ 720, 288, 432, 576 }, result.effective);
    try std.testing.expect(result.changed and result.use_cell);
    const frame: Frame = .{ .width = 10000, .height = 4000 };
    const signed: Source = .{ .use_cell = false, .cell = .{ -32768, -1, 30, 40 }, .table = source.table };
    const signed_after = try prepare(signed, frame, .{ .custom = .{ 720, null, null, null } });
    try std.testing.expectEqualDeep([4]u32{ 720, 288, 432, 576 }, signed_after.effective);
    const dormant = try prepare(signed, frame, .inherit);
    try std.testing.expect(!dormant.changed);
    try std.testing.expectEqualDeep(signed.cell, dormant.cell);
    const explicit = try prepare(source, frame, .{ .custom = .{ null, null, null, null } });
    try std.testing.expect(explicit.changed and explicit.use_cell);
    try std.testing.expectEqualDeep(try effective(source, frame), explicit.effective);
    const same_effective: Source = .{ .use_cell = true, .cell = source.table, .table = source.table };
    const back = try prepare(same_effective, frame, .inherit);
    try std.testing.expect(back.changed and !back.use_cell);
    try std.testing.expectEqualDeep(same_effective.cell, back.cell);
}
test "original cell insets shared explicit zero no-op and inheritance retain dormant raw" {
    const source: Source = .{ .use_cell = true, .cell = .{ 720, 288, 432, 576 }, .table = .{ 144, 288, 432, 576 } };
    const frame: Frame = .{ .width = 10000, .height = 4000 };
    try std.testing.expect(!(try prepare(source, frame, .{ .custom = .{ null, null, null, null } })).changed);
    const zero = try prepare(source, frame, .{ .custom = .{ 0, null, null, null } });
    try std.testing.expectEqual(@as(u32, 0), zero.effective[0]);
    const inherited = try prepare(source, frame, .inherit);
    try std.testing.expectEqualDeep(source.cell, inherited.cell);
    try std.testing.expectEqualDeep([4]u32{ 144, 288, 432, 576 }, inherited.effective);
}
test "original cell insets shared refuses unknown out-of-domain and exhausted inner frame" {
    var source: Source = .{ .use_cell = false, .cell = .{ 10, 20, 30, 40 }, .table = .{ 144, 288, 432, 576 } };
    const frame: Frame = .{ .width = 10000, .height = 4000 };
    try std.testing.expectError(error.UnsupportedCellInsets, prepare(source, frame, .{ .custom = .{ 32768, null, null, null } }));
    try std.testing.expectError(error.InvalidCellInsetsInnerBox, prepare(source, frame, .{ .custom = .{ 9712, null, null, null } }));
    source.use_cell = null;
    try std.testing.expectError(error.UnknownCellInsets, prepare(source, frame, .inherit));
}
