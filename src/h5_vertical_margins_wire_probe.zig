//! Prepared wire cohort; no execution evidence.
const std = @import("std");
const wire = @import("wasm/hwp5_vertical_outer_margins_wire.zig");
const square = @import("wasm/hwp5_object_outer_margins_wire.zig");
const native = @import("hwp5/edit/object_outer_margins.zig");
const Ticket = @import("model/history_mutation_epoch.zig").Ticket;
const ticket: Ticket = .{ .binding = .{ .document = 0xfffffffffffffff0, .generation = 0x100000002, .owner = 0x100000003 }, .epoch = 0x100000004 };
fn request() wire.Request {
    const observed: native.Observation = .{
        .target = .{ .selector = .{ .section = 0, .node = 11, .kind = .picture }, .control_node = 9, .component_node = 10, .paragraph_node = 0, .paragraph = 0, .anchor_unit = 351, .instance_id = 1, .source_sha256 = @splat(77), .ticket = ticket },
        .margins = .{ -32768, -1, 0, 0 },
        .flags = 0x002a0310,
        .wrap_ordinal = 1,
        .table70_name = .tight,
        .current_renderer_margin_policy = .compact_vertical_exclusion,
        .treat_as_character = false,
        .editable = true,
        .reason = null,
    };
    return .{ .schemaVersion = 1, .profile = .@"hwp5-observed-vertical-outer-margins-v1", .witness = square.Observation.from(observed, 0x100000005, 4), .top = 750, .bottom = 1500 };
}
test "H5 observed vertical wire preserves full ticket and signed horizontal words" {
    const r = try request().validate(ticket, 0x100000005, 4);
    try std.testing.expectEqualDeep(ticket, r.target.ticket);
    try std.testing.expectEqualDeep([_]i16{ -32768, -1, 750, 1500 }, r.margins);
}
test "H5 observed vertical wire rejects stale full fences" {
    var other = ticket;
    other.binding.generation += 1;
    try std.testing.expectError(error.SourceBindingMismatch, request().validate(other, 0x100000005, 4));
    other = ticket;
    other.epoch += 1;
    try std.testing.expectError(error.StaleMutationEpoch, request().validate(other, 0x100000005, 4));
    try std.testing.expectError(error.StaleCurrentReference, request().validate(ticket, 0x100000006, 4));
    try std.testing.expectError(error.StaleCurrentReference, request().validate(ticket, 0x100000005, 5));
}
test "H5 observed vertical wire and Square v1 never accept the other ordinal" {
    var r = request();
    const old: square.Request = .{ .schemaVersion = 1, .witness = r.witness, .margins = .{ .left = 0, .right = 0, .top = 750, .bottom = 1500 } };
    try std.testing.expectError(error.UnsupportedOuterMarginsPolicy, old.validate(ticket, 0x100000005, 4));
    r.witness.wrapOrdinal = 0;
    try std.testing.expectError(error.UnsupportedVerticalMarginsPolicy, r.validate(ticket, 0x100000005, 4));
    r = request();
    r.witness.@"inline" = true;
    try std.testing.expectError(error.UnsupportedVerticalMarginsPolicy, r.validate(ticket, 0x100000005, 4));
    r = request();
    r.witness.editable = false;
    try std.testing.expectError(error.UnsupportedVerticalMarginsPolicy, r.validate(ticket, 0x100000005, 4));
}
test "H5 observed vertical wire exact cap plus one and signed retention" {
    const a = std.testing.allocator;
    var r = request();
    const json = try std.json.Stringify.valueAlloc(a, r, .{});
    defer a.free(json);
    const padded = try a.alloc(u8, wire.max_bytes + 1);
    defer a.free(padded);
    @memset(padded, ' ');
    @memcpy(padded[0..json.len], json);
    var exact = try wire.parse(a, padded[0..wire.max_bytes]);
    defer exact.deinit();
    _ = try exact.value.validate(ticket, 0x100000005, 4);
    try std.testing.expectError(error.LimitExceeded, wire.parse(a, padded));
    r.witness.margins.top = -20;
    r.top = -20;
    _ = try r.validate(ticket, 0x100000005, 4);
    r.top = -21;
    try std.testing.expectError(error.InvalidVerticalMargin, r.validate(ticket, 0x100000005, 4));
}
test "H5 observed vertical wire registration" {}
