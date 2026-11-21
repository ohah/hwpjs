const std = @import("std");
const wire = @import("wasm/created_cell_properties_wire.zig");
const a = std.testing.allocator;
const payload = "{\"section\":0,\"identity\":\"18446744073709551615\",\"row\":0,\"column\":1,\"expected\":{\"width\":100,\"height\":20},\"size\":{\"width\":110},\"witness\":{\"document\":\"123\",\"generation\":\"1\",\"owner\":\"456\",\"epoch\":\"9007199254740993\"},\"appearance\":{\"background\":{\"none\":{}}}}";
test "created cell property wire full decimal ticket and explicit none union" {
    const request = try wire.decode(a, payload);
    try std.testing.expectEqual(std.math.maxInt(u64), request.address.identity);
    try std.testing.expectEqual(@as(u64, 9007199254740993), request.expected_ticket.epoch);
    try std.testing.expect(request.appearance.background.? == .none);
    const json = try wire.ticketJSON(a, request.expected_ticket);
    defer a.free(json);
    try std.testing.expect(std.mem.indexOf(u8, json, "9007199254740993") != null);
}
test "created cell property wire unknown duplicate and request cap reject" {
    const unknown = try std.mem.concat(a, u8, &.{ payload[0 .. payload.len - 1], ",\"tableNode\":1}" });
    defer a.free(unknown);
    try std.testing.expectError(error.UnknownField, wire.decode(a, unknown));
    const duplicate = try std.mem.concat(a, u8, &.{ payload[0 .. payload.len - 1], ",\"row\":1}" });
    defer a.free(duplicate);
    try std.testing.expectError(error.DuplicateField, wire.decode(a, duplicate));
    const too_long = try a.alloc(u8, wire.max_request_bytes + 1);
    defer a.free(too_long);
    @memset(too_long, ' ');
    try std.testing.expectError(error.LimitExceeded, wire.decode(a, too_long));
}
fn allocated(a1: std.mem.Allocator) !void {
    const request = try wire.decode(a1, payload);
    const json = try wire.ticketJSON(a1, request.expected_ticket);
    defer a1.free(json);
}
test "created cell property wire decode and ticket output allocation ownership" {
    try std.testing.checkAllAllocationFailures(a, allocated, .{});
}
