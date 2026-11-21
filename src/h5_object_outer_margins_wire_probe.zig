const std = @import("std");
const wire = @import("wasm/hwp5_object_outer_margins_wire.zig");
const native = @import("hwp5/edit/object_outer_margins.zig");
const Ticket = @import("model/history_mutation_epoch.zig").Ticket;
const ticket: Ticket = .{ .binding = .{ .document = 0xffffffffffffffff, .generation = 0x100000002, .owner = 0x100000003 }, .epoch = 0x100000004 };
fn request() wire.Request {
    const observation: native.Observation = .{
        .target = .{ .selector = .{ .section = 0, .node = 10, .kind = .textbox }, .control_node = 8, .component_node = 10, .paragraph_node = 0, .paragraph = 0, .anchor_unit = 2, .instance_id = 7, .source_sha256 = @splat(77), .ticket = ticket },
        .margins = .{ -32768, 2, 3, 4 },
        .flags = 0,
        .wrap_ordinal = 0,
        .table70_name = .square,
        .current_renderer_margin_policy = .square_exclusion,
        .treat_as_character = false,
        .editable = true,
        .reason = null,
    };
    return .{ .schemaVersion = 1, .witness = wire.Observation.from(observation, 0x100000005, 4), .margins = .{ .left = 1, .right = 2, .top = 3, .bottom = 4 } };
}
test "H5 outer margins wire full ticket exact words" {
    const result = try request().validate(ticket, 0x100000005, 4);
    try std.testing.expectEqualDeep(ticket, result.target.ticket);
    try std.testing.expectEqual(@as(i16, -32768), result.expected[0]);
}
test "H5 outer margins wire stale binding epoch view revision rejected" {
    var stale = ticket;
    stale.binding.owner += 1;
    try std.testing.expectError(error.SourceBindingMismatch, request().validate(stale, 0x100000005, 4));
    stale = ticket;
    stale.epoch += 1;
    try std.testing.expectError(error.StaleMutationEpoch, request().validate(stale, 0x100000005, 4));
    try std.testing.expectError(error.StaleCurrentReference, request().validate(ticket, 0x100000006, 4));
    try std.testing.expectError(error.StaleCurrentReference, request().validate(ticket, 0x100000005, 5));
}
test "H5 outer margins wire raw3 inline and negative write rejected" {
    var value = request();
    value.witness.wrapOrdinal = 3;
    try std.testing.expectError(error.UnsupportedOuterMarginsPolicy, value.validate(ticket, 0x100000005, 4));
    value = request();
    value.witness.@"inline" = true;
    try std.testing.expectError(error.UnsupportedOuterMarginsPolicy, value.validate(ticket, 0x100000005, 4));
    value = request();
    value.margins.left = -1;
    try std.testing.expectError(error.InvalidOuterMargins, value.validate(ticket, 0x100000005, 4));
}
test "H5 outer margins wire strict JSON and cap" {
    const a = std.testing.allocator;
    const bytes = try std.json.Stringify.valueAlloc(a, request(), .{});
    defer a.free(bytes);
    var parsed = try wire.parse(a, bytes);
    defer parsed.deinit();
    _ = try parsed.value.validate(ticket, 0x100000005, 4);
    const over = try a.alloc(u8, wire.max_bytes + 1);
    defer a.free(over);
    try std.testing.expectError(error.LimitExceeded, wire.parse(a, over));
    try std.testing.expectError(error.UnknownField, wire.parse(a, "{\"unexpected\":0}"));
}
