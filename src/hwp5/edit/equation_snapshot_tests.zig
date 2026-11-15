const std = @import("std");
const snapshot = @import("equation_snapshot.zig");
const model = @import("../../model/document.zig");
const a = std.testing.allocator;
const version = @import("../version.zig").Version{ .raw = 0x05010001 };
const anchor = [_]u8{ 11, 0, 'd', 'e', 'q', 'e', 0, 0, 0, 0, 0, 0, 0, 0, 11, 0 };
// Independent EQEDIT bytes: script x, 1000 HWPUNIT, COLORREF 0x112233,
// baseline -2, unknown 7, version v, opaque trailing byte 0xab.
const payload = [_]u8{ 1, 0, 0, 0, 1, 0, 120, 0, 0xe8, 3, 0, 0, 0x33, 0x22, 0x11, 0, 0xfe, 0xff, 7, 0, 1, 0, 118, 0, 0xab };
fn record(out: *std.ArrayList(u8), tag: u32, level: u32, bytes: []const u8) !void {
    var header: [4]u8 = undefined;
    std.mem.writeInt(u32, &header, tag | (level << 10) | (@as(u32, @intCast(bytes.len)) << 20), .little);
    try out.appendSlice(a, &header);
    try out.appendSlice(a, bytes);
}
fn rawSection() ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    var header: [22]u8 = @splat(0);
    std.mem.writeInt(u32, header[0..4], 8, .little);
    try record(&out, 66, 0, &header);
    try record(&out, 67, 1, &anchor);
    try record(&out, 71, 1, &([_]u8{ 'd', 'e', 'q', 'e' } ++ @as([40]u8, @splat(0))));
    try record(&out, 88, 2, &payload);
    return out.toOwnedSlice(a);
}
fn paragraphs(tokens: []model.Token) [1]model.Paragraph {
    return .{.{ .source_node = 0, .parent_node = null, .declared_units = 8, .text_present = true, .para_shape_id = 0, .style_id = 0, .tokens = tokens, .character_runs = &.{}, .deferred_direct_records = 0 }};
}
fn allocationProbe(allocator: std.mem.Allocator, raw: []const u8, rows: []const model.Paragraph) !void {
    const result = try snapshot.encode(allocator, raw, version, rows, .version_only);
    defer allocator.free(result);
}
test "HWP5 equation snapshot owns script metadata and exact current physical binding" {
    const raw = try rawSection();
    var control = anchor;
    var tokens = [_]model.Token{.{ .start_unit = 0, .kind = .control, .encoding = .utf16le, .raw = &control }};
    const rows = paragraphs(&tokens);
    const result = snapshot.encode(a, raw, version, &rows, .version_only) catch |err| {
        a.free(raw);
        return err;
    };
    a.free(raw);
    defer a.free(result);
    var value = try std.json.parseFromSlice(std.json.Value, a, result, .{});
    defer value.deinit();
    const sources = value.value.object.get("sources").?.array.items;
    try std.testing.expectEqual(@as(usize, 1), sources.len);
    const source = sources[0].object;
    try std.testing.expectEqual(@as(i64, 120), source.get("scriptUtf16LE").?.array.items[0].integer);
    try std.testing.expectEqual(@as(i64, 0xab), source.get("extraBytes").?.array.items[0].integer);
    try std.testing.expectEqual(@as(i64, -2), source.get("baseline").?.integer);
    const site = source.get("site").?.object;
    try std.testing.expectEqual(@as(i64, 3), site.get("equation_node").?.integer);
    try std.testing.expectEqual(@as(i64, 0), site.get("paragraph").?.integer);
    try std.testing.expectEqual(@as(i64, 0), site.get("current_unit").?.integer);
}
test "HWP5 equation snapshot rejects missing and duplicate current owners" {
    const raw = try rawSection();
    defer a.free(raw);
    var control = anchor;
    var tokens = [_]model.Token{.{ .start_unit = 0, .kind = .control, .encoding = .utf16le, .raw = &control }};
    const rows = paragraphs(&tokens);
    try std.testing.expectError(error.MissingCurrentEquationAnchor, snapshot.encode(a, raw, version, &.{}, .version_only));
    try std.testing.expectError(error.SourceBindingMismatch, snapshot.encode(a, raw, version, &.{ rows[0], rows[0] }, .version_only));
}
test "HWP5 equation snapshot allocation failures release owned wire and lookup state" {
    const raw = try rawSection();
    defer a.free(raw);
    var control = anchor;
    var tokens = [_]model.Token{.{ .start_unit = 0, .kind = .control, .encoding = .utf16le, .raw = &control }};
    const rows = paragraphs(&tokens);
    var calls: usize = 0;
    const sweep = @import("../../testing/allocation_failures.zig");
    try sweep.check(struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, source_rows: []const model.Paragraph, count: *usize) !void {
            count.* += 1;
            try allocationProbe(allocator, bytes, source_rows);
        }
    }.run, .{ raw, @as([]const model.Paragraph, &rows), &calls });
    try std.testing.expect(calls >= sweep.success_controls);
    std.debug.print("H5_EQ_SNAPSHOT_OOM callbacks={d} induced={d}\n", .{ calls, calls - sweep.success_controls });
}
