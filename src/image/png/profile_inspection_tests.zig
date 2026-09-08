const std = @import("std");
const t = std.testing;
const api = @import("profile_inspection.zig");
const payload = @import("embedded_profile_fixture.zig").payload;
fn header(kind: u8) @import("header.zig").Header {
    return .{ .width = 1, .height = 1, .bit_depth = 8, .color_type = kind, .interlace = 0 };
}
const raw = @import("embedded_profile_fixture.zig").emptyProfile;
test "PNG profile color spaces distinguish indexed RGB and grayscale alpha" {
    for (0..256) |kind| {
        for ([_][4]u8{ "RGB ".*, "GRAY".*, "CMYK".* }) |space| {
            const h = header(@intCast(kind));
            if (kind != 0 and kind != 2 and kind != 3 and kind != 4 and kind != 6) {
                try t.expectError(error.UnsupportedPngFormat, api.validateColorSpace(h, space));
            } else if (std.mem.eql(u8, &space, if (kind == 0 or kind == 4) "GRAY" else "RGB ")) {
                try api.validateColorSpace(h, space);
            } else try t.expectError(error.InvalidPngProfileColorSpace, api.validateColorSpace(h, space));
        }
    }
}
fn inspectAllocated(a: std.mem.Allocator) !void {
    const bytes = try payload(a, "Profile", &raw("RGB ".*));
    defer a.free(bytes);
    var result = try api.inspect(a, header(3), bytes, .{ .layout = .bounded });
    defer result.deinit(a);
    try t.expect(result.semantics_deferred);
    try t.expect(!result.table.storage.layout_validated);
    try t.expectEqualStrings("Profile", result.envelope.name);
    try t.expectEqual(@intFromPtr(bytes.ptr), @intFromPtr(result.envelope.name.ptr));
    try t.expectEqual(@as(usize, 0), result.table.tags.len);
}
test "PNG profile integration retains deferred semantics and frees all allocations" {
    try inspectAllocated(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, inspectAllocated, .{});
}
test "PNG profile rejects arbitrary decoded bytes and wrong color space" {
    const arbitrary = try payload(t.allocator, "P", "not ICC");
    defer t.allocator.free(arbitrary);
    try t.expectError(error.InvalidIccProfileSize, api.inspect(t.allocator, header(2), arbitrary, .{ .layout = .bounded }));
    const bytes = try payload(t.allocator, "P", &raw("GRAY".*));
    defer t.allocator.free(bytes);
    try t.expectError(error.InvalidPngProfileColorSpace, api.inspect(t.allocator, header(3), bytes, .{ .layout = .bounded }));
    try t.expectError(error.LimitExceeded, api.inspect(t.allocator, header(0), bytes, .{ .layout = .bounded, .envelope = .{ .max_profile_bytes = 131 } }));
    var result = try api.inspect(t.allocator, header(4), bytes, .{ .layout = .icc_2022 });
    defer result.deinit(t.allocator);
    try t.expect(result.table.storage.layout_validated and result.semantics_deferred);
}
