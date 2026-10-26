//! Current native run boundaries in raw UTF-16 units, including controls/CR.
const std = @import("std");
const model = @import("../../model/document.zig");
pub const Range = struct { start_unit: u32, end_unit: u32, char_shape_id: ?u32 };
pub fn read(a: std.mem.Allocator, p: model.Paragraph, count: usize) ![]Range {
    const bytes = try @import("plain_text_content.zig").textBytes(a, p);
    defer a.free(bytes);
    return fromRaw(a, p.character_runs, bytes, count);
}
pub fn fromRaw(a: std.mem.Allocator, runs: []const model.CharacterRun, bytes: []const u8, count: usize) ![]Range {
    if (bytes.len % 2 != 0 or bytes.len > 8 * 1024 * 1024) return error.InvalidTextLength;
    const units: u32 = @intCast(bytes.len / 2);
    if (units == 0) {
        if (runs.len == 0) return a.alloc(Range, 0);
        try @import("character_runs.zig").validate(runs, bytes, count);
        const output = try a.alloc(Range, 1);
        output[0] = .{ .start_unit = 0, .end_unit = 0, .char_shape_id = runs[0].char_shape_id };
        return output;
    }
    if (runs.len == 0) {
        const output = try a.alloc(Range, 1);
        output[0] = .{ .start_unit = 0, .end_unit = units, .char_shape_id = null };
        return output;
    }
    try @import("character_runs.zig").validate(runs, bytes, count);
    var output: std.ArrayList(Range) = .empty;
    errdefer output.deinit(a);
    for (runs, 0..) |run, index| {
        if (run.start_unit >= units) break;
        const end = if (index + 1 < runs.len) @min(units, runs[index + 1].start_unit) else units;
        try output.append(a, .{ .start_unit = run.start_unit, .end_unit = end, .char_shape_id = run.char_shape_id });
    }
    return output.toOwnedSlice(a);
}
fn allocationCase(a: std.mem.Allocator) !void {
    const bytes = [_]u8{ 'A', 0, 'B', 0, 13, 0 };
    const runs = [_]model.CharacterRun{ .{ .start_unit = 0, .char_shape_id = 1 }, .{ .start_unit = 1, .char_shape_id = 0 }, .{ .start_unit = 3, .char_shape_id = 1 } };
    const output = try fromRaw(a, &runs, &bytes, 2);
    defer a.free(output);
    try std.testing.expectEqual(@as(usize, 2), output.len);
    try std.testing.expectEqual(@as(u32, 3), output[1].end_unit);
}
test "HWP5 display ranges use current runs and reject invalid references with allocation failure" {
    try @import("../../testing/allocation_failures.zig").check(allocationCase, .{});
    const bad = [_]model.CharacterRun{.{ .start_unit = 0, .char_shape_id = 2 }};
    try std.testing.expectError(error.InvalidResourceReference, fromRaw(std.testing.allocator, &bad, &.{ 'A', 0, 13, 0 }, 2));
}
