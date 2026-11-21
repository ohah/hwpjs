const std = @import("std");
const a = std.testing.allocator;
const wire = @import("wasm/created_cell_properties_wire.zig");
const projection = @import("model/created_cell_vertical_alignment_projection.zig");
const prefix = "{\"section\":0,\"identity\":\"17\",\"row\":0,\"column\":1,\"expected\":{\"width\":100,\"height\":20},\"witness\":{\"document\":\"1\",\"generation\":\"2\",\"owner\":\"3\",\"epoch\":\"4\"}";
test "created cell valign wire strict numeric values and absent old property compatibility" {
    const old = try wire.decode(a, prefix ++ ",\"size\":{\"height\":30}}");
    try std.testing.expect(old.vertical_alignment == null);
    for (0..3) |value| {
        const bytes = try std.fmt.allocPrint(a, "{s},\"vertical_alignment\":{d}}}", .{ prefix, value });
        defer a.free(bytes);
        const request = try wire.decode(a, bytes);
        try std.testing.expectEqual(value, @as(usize, @backingInt(request.vertical_alignment.?)));
        try std.testing.expectEqual(@as(u64, 3), request.expected_ticket.binding.owner);
    }
    for ([_][]const u8{ "null", "\"TOP\"", "true", "3", "-1", "1.5" }) |value| {
        const bytes = try std.fmt.allocPrint(a, "{s},\"vertical_alignment\":{s}}}", .{ prefix, value });
        defer a.free(bytes);
        if (wire.decode(a, bytes)) |_| return error.ExpectedInvalidAlignment else |_| {}
    }
    const valid = prefix ++ ",\"vertical_alignment\":2}";
    var exact: [wire.max_request_bytes]u8 = @splat(' ');
    @memcpy(exact[0..valid.len], valid);
    _ = try wire.decode(a, &exact);
    var too_large: [wire.max_request_bytes + 1]u8 = @splat(' ');
    @memcpy(too_large[0..valid.len], valid);
    try std.testing.expectError(error.LimitExceeded, wire.decode(a, &too_large));
    try std.testing.expectError(error.UnknownField, wire.decode(a, prefix ++ ",\"vertical_alignment\":2,\"cells\":[]}"));
}
fn fixture() !@import("model/created_table.zig").Table {
    return @import("model/created_table.zig").create(a, 17, 19, try @import("model/table_creation_plan.zig").create(2, 2, 200, 20, 4), &.{ 1, 2, 3, 4 }, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 0 }, 4);
}
test "created cell valign supplemental complete owners null retention duplicate and exact budget" {
    var table = try fixture();
    defer table.deinit(a);
    var builder = projection.Builder.init(a, 100000);
    defer builder.deinit();
    try builder.appendTable(0, &table, null);
    try std.testing.expectEqual(@as(usize, 4), builder.rows.items.len);
    for (builder.rows.items, 0..) |row, index| {
        try std.testing.expect(row.value == null);
        try std.testing.expectEqualStrings("17", row.identity);
        try std.testing.expectEqual(@as(u32, @intCast(index / 2)), row.row);
        try std.testing.expectEqual(@as(u32, @intCast(index % 2)), row.column);
    }
    const bytes = try builder.json("hwp5");
    defer a.free(bytes);
    try std.testing.expect(std.mem.indexOf(u8, bytes, "\"value\":null") != null);
    try std.testing.expectError(error.InvalidCreatedTableIdentity, builder.appendTable(1, &table, .top));
    const cap = 4 * (@sizeOf(projection.Row) + 2);
    var exact = projection.Builder.init(a, cap);
    defer exact.deinit();
    try exact.appendTable(0, &table, .top);
    var short = projection.Builder.init(a, cap - 1);
    defer short.deinit();
    try std.testing.expectError(error.LimitExceeded, short.appendTable(0, &table, .top));
}
test "created cell valign optional schema four additive no-argument i32 signatures" {
    const schema = @import("wasm/abi_schema.zig");
    try std.testing.expectEqual(@as(usize, 4), schema.created_cell_vertical_alignment_signatures.len);
    for (schema.created_cell_vertical_alignment_signatures) |signature| {
        try std.testing.expectEqual(@as(usize, 0), signature.params.len);
        try std.testing.expectEqual(@as(usize, 1), signature.results.len);
        try std.testing.expectEqualStrings("i32", signature.results[0]);
    }
}
