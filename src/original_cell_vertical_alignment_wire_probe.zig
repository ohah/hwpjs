const std = @import("std");
const wire = @import("wasm/original_cell_vertical_alignment_wire.zig");
test "original cell alignment wire strict token value and size" {
    const a = std.testing.allocator;
    const request = try wire.decode(a, "{\"lease\":\"18446744073709551615\",\"value\":\"BOTTOM\"}");
    try std.testing.expectEqual(std.math.maxInt(u64), request.lease);
    try std.testing.expectEqual(.bottom, request.value);
    try std.testing.expectError(error.InvalidOriginalCellLease, wire.decode(a, "{\"lease\":\"0\",\"value\":\"TOP\"}"));
    try std.testing.expectError(error.UnsupportedCellVerticalAlignment, wire.decode(a, "{\"lease\":\"1\",\"value\":\"middle\"}"));
    try std.testing.expectError(error.LimitExceeded, wire.decode(a, &(@as([257]u8, @splat(32)))));
}
test "original cell alignment wire exact cap and extra witness refuse" {
    const a = std.testing.allocator;
    const valid = "{\"lease\":\"1\",\"value\":\"TOP\"}";
    var exact: [wire.max_request_bytes]u8 = @splat(' ');
    @memcpy(exact[0..valid.len], valid);
    const request = try wire.decode(a, &exact);
    try std.testing.expectEqual(@as(u64, 1), request.lease);
    const exceeded: [wire.max_request_bytes + 1]u8 = @splat(' ');
    try std.testing.expectError(error.LimitExceeded, wire.decode(a, &exceeded));
    try std.testing.expectError(error.UnknownField, wire.decode(a, "{\"lease\":\"1\",\"value\":\"TOP\",\"witness\":{}}"));
}
test "original cell alignment wire absent HX value stays null without suppressing editable" {
    const a = std.testing.allocator;
    const bytes = try wire.observation(a, "hwpx", 0, 7, 2, 3, 1, 4, null, false);
    defer a.free(bytes);
    var parsed = try std.json.parseFromSlice(std.json.Value, a, bytes, .{});
    defer parsed.deinit();
    try std.testing.expect(parsed.value.object.get("value").? == .null);
    try std.testing.expect(parsed.value.object.get("editable").?.bool);
    try std.testing.expectEqualStrings("1", parsed.value.object.get("lease").?.string);
}
