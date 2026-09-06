const std = @import("std");
const t = std.testing;
const p = @import("parser.zig");
const observed: p.Options = .{ .header_layout = .observed6, .null_layout = .observed_empty };
const bytes = [_]u8{ 0x1b, 2, 1, 0, 0xab, 0xcd, 0, 0x40, 1, 0, 2, 0, 0x41, 0, 0x42, 0 };
fn allocationCase(a: std.mem.Allocator) !void {
    var doc = try p.Document.parse(a, &bytes, observed);
    defer doc.deinit(a);
    try t.expectEqual(2, doc.nodes.len);
    try t.expectEqual(16, doc.consumed);
    try t.expectEqual(0, doc.extra.len);
    const root = doc.nodes[0];
    try t.expectEqual(0x021b, root.value.set.id);
    try t.expectEqual(0xcdab, root.value.set.reserved.?);
    try t.expect(root.parent == null and root.item_id == null);
    try t.expectEqual(2, root.subtree_end);
    const s = doc.nodes[1];
    try t.expectEqual(0, s.parent.?);
    try t.expectEqual(0x4000, s.item_id.?);
    try t.expectEqualSlices(u8, bytes[12..], s.value.string);
    try t.expect(s.value.string.ptr == bytes[12..].ptr);
    try t.expect(s.raw.ptr == bytes[6..].ptr);
}
test "parameter node ownership, raw UTF16 and allocation cleanup" {
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{});
    for (0..bytes.len) |n| try t.expectError(error.UnexpectedEnd, p.Document.parse(t.allocator, bytes[0..n], observed));
}
test "parameter explicit header/null layout and signed counts" {
    const b = [_]u8{ 1, 0, 1, 0, 7, 0, 0, 0, 255, 255, 255, 255, 17 };
    var doc = try p.Document.parse(t.allocator, &b, .{ .header_layout = .spec4, .null_layout = .spec_u32 });
    defer doc.deinit(t.allocator);
    try t.expect(doc.nodes[0].value.set.reserved == null);
    try t.expectEqual(0xffffffff, doc.nodes[1].value.null_value.?);
    try t.expectEqualSlices(u8, &.{17}, doc.extra);
    try t.expectError(error.NegativeParameterCount, p.Document.parse(t.allocator, &.{ 1, 0, 255, 255, 0, 0 }, observed));
    try t.expectError(error.InvalidParameterLimit, p.Document.parse(t.allocator, &bytes, .{ .header_layout = .observed6, .null_layout = .observed_empty, .max_depth = 65 }));
    try t.expectError(error.ParameterNodeLimit, p.Document.parse(t.allocator, &bytes, .{ .header_layout = .observed6, .null_layout = .observed_empty, .max_nodes = 1 }));
}
test "parameter arrays inherit shared IDs and preserve full integer storage" {
    const b = [_]u8{ 1, 0, 1, 0, 0, 0, 3, 0, 1, 128, 2, 0, 9, 0, 2, 0, 255, 128, 127, 255, 2, 128, 5, 0 };
    var doc = try p.Document.parse(t.allocator, &b, observed);
    defer doc.deinit(t.allocator);
    try t.expectEqual(4, doc.nodes.len);
    try t.expectEqual(9, doc.nodes[1].value.array.shared_id.?);
    try t.expectEqual(9, doc.nodes[2].item_id.?);
    try t.expect(!doc.nodes[2].id_on_wire);
    try t.expectEqual(0xff7f80ff, doc.nodes[2].value.integer);
    try t.expectEqual(1, doc.nodes[3].parent.?);
    try t.expectEqual(5, doc.nodes[3].value.binary_id);
}
test "cell field reads direct typed item, retains empty name and rejects duplicate names" {
    const field = @import("../body/cell_field.zig");
    const Extension = @import("../body/cell_extension.zig").Extension;
    const ext: Extension = .{ .text_width = 0, .marker = 255, .remaining = &bytes };
    const result = (try field.inspect(t.allocator, ext, observed)).?;
    try t.expect(result.recognized_set);
    try t.expectEqualSlices(u8, bytes[12..], result.field_name_utf16.?);
    var dup: [26]u8 = undefined;
    @memcpy(dup[0..16], &bytes);
    dup[2] = 2;
    @memcpy(dup[16..], bytes[6..]);
    try t.expectError(error.DuplicateCellFieldName, field.inspect(t.allocator, .{ .text_width = null, .marker = 255, .remaining = &dup }, observed));
    const empty = [_]u8{ 0x1b, 2, 1, 0, 0, 0, 0, 0x40, 1, 0, 0, 0 };
    const e = (try field.inspect(t.allocator, .{ .text_width = 0, .marker = 255, .remaining = &empty }, observed)).?;
    try t.expectEqual(0, e.field_name_utf16.?.len);
}
fn lateFailure(a: std.mem.Allocator) !void {
    var b = [_]u8{0} ** 80;
    b[0] = 1;
    b[2] = 1;
    b[6] = 3;
    b[8] = 1;
    b[9] = 128;
    b[10] = 33;
    b[12] = 9;
    b[78] = 255;
    b[79] = 127;
    var doc = p.Document.parse(a, &b, observed) catch |err| {
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(error.UnsupportedParameterType, err);
        return;
    };
    doc.deinit(a);
    return error.TestExpectedError;
}
fn fieldFailure(a: std.mem.Allocator) !void {
    const b = [_]u8{ 0x1b, 2, 1, 0, 0, 0, 0, 0x40, 4, 0, 0, 0, 0, 0 };
    _ = @import("../body/cell_field.zig").inspect(a, .{ .text_width = 0, .marker = 255, .remaining = &b }, observed) catch |err| {
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(error.InvalidCellFieldType, err);
        return;
    };
    return error.TestExpectedError;
}
test "parameter and cell-field late failures free every reallocation" {
    try t.checkAllAllocationFailures(t.allocator, lateFailure, .{});
    try t.checkAllAllocationFailures(t.allocator, fieldFailure, .{});
}
test "parameter recursion ceiling is bounded even when caller raises the default" {
    var b = [_]u8{0} ** 646;
    for (0..64) |i| {
        const start = i * 10;
        b[start] = 1;
        b[start + 2] = 1;
        b[start + 6] = 1;
        b[start + 9] = 128;
    }
    b[640] = 1;
    var options = observed;
    options.max_depth = 64;
    var doc = try p.Document.parse(t.allocator, &b, options);
    defer doc.deinit(t.allocator);
    try t.expectEqual(65, doc.nodes.len);
    try t.expectEqual(65, doc.nodes[0].subtree_end);
    options.max_depth = 63;
    try t.expectError(error.ParameterDepthLimit, p.Document.parse(t.allocator, &b, options));
}
