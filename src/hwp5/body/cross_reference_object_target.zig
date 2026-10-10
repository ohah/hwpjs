//! Numeric object ID lookup only. Missing IDs never become guessed targets.
const std = @import("std");
pub const Site = struct { section: usize, record_offset: usize, control_id: u32, instance_id: u32 };

/// Caller supplies objects parsed by object_common, across the whole document.
/// No bookmark ID, automatic number, ordinal or nearest object fallback.
pub fn resolve(instance_id: u32, objects: []const Site) !?Site {
    var found: ?Site = null;
    for (objects) |object| {
        if (!@import("object_common.zig").supports(object.control_id)) return error.InvalidCrossReferenceObject;
        if (object.instance_id != instance_id) continue;
        if (found != null) return error.AmbiguousCrossReferenceTarget;
        found = object;
    }
    return found;
}

/// Semantic adapter: never send note indexes or external references to local IDs.
pub fn resolveCommand(view: @import("cross_reference_command.zig").View, objects: []const Site) !?Site {
    if (view.external_document != null) return error.UnsupportedExternalCrossReference;
    const semantic = try view.semantics();
    if (semantic.targetSpace() != .object_instance) return error.UnsupportedCrossReferenceTargetSpace;
    const selected = (try resolve(view.target.numeric, objects)) orelse return null;
    const rules = @import("control_rules.zig");
    const expected = switch (semantic.object) {
        .table => rules.table_id,
        .picture => rules.drawing_id, // Drawing family, not a bitmap-type assertion.
        .equation => rules.equation_id,
        else => return error.UnsupportedCrossReferenceTargetSpace,
    };
    if (selected.control_id != expected) return error.CrossReferenceObjectKindMismatch;
    return selected;
}

fn wire(comptime text: []const u8) [text.len * 2]u8 {
    var bytes: [text.len * 2]u8 = @splat(0);
    for (text, 0..) |c, index| bytes[index * 2] = c;
    return bytes;
}

test "cross reference command object lookup rejects wrong family note index and external alias" {
    const rules = @import("control_rules.zig");
    const view = @import("cross_reference_command.zig").View;
    const table = Site{ .section = 0, .record_offset = 20, .control_id = rules.table_id, .instance_id = 123 };
    const command = try view.parse(&wire("?#123;0;1;0;0;"));
    try std.testing.expectEqual(table, (try resolveCommand(command, &.{table})).?);
    try std.testing.expectError(error.CrossReferenceObjectKindMismatch, resolveCommand(try view.parse(&wire("?#123;1;1;0;0;")), &.{table}));
    try std.testing.expectError(error.UnsupportedCrossReferenceTargetSpace, resolveCommand(try view.parse(&wire("?#123;3;1;0;0;")), &.{table}));
    try std.testing.expectError(error.UnsupportedExternalCrossReference, resolveCommand(try view.parse(&wire("C:\\other.hwp?#123;0;1;0;0;")), &.{table}));
    try std.testing.expect(try resolveCommand(try view.parse(&wire("?#999;0;1;0;0;")), &.{table}) == null);
    var alias = table;
    alias.section = 1;
    alias.control_id = rules.drawing_id;
    try std.testing.expectError(error.AmbiguousCrossReferenceTarget, resolveCommand(command, &.{ table, alias }));
}

test "cross reference object target never guesses missing or duplicate IDs across sections" {
    const rules = @import("control_rules.zig");
    const first = Site{ .section = 0, .record_offset = 20, .control_id = rules.table_id, .instance_id = 123 };
    const second = Site{ .section = 2, .record_offset = 40, .control_id = rules.drawing_id, .instance_id = 456 };
    try std.testing.expectEqual(first, (try resolve(123, &.{ first, second })).?);
    try std.testing.expectEqual(second, (try resolve(456, &.{ first, second })).?);
    try std.testing.expect(try resolve(999, &.{ first, second }) == null);
    try std.testing.expect(try resolve(123, &.{}) == null);
    var duplicate = second;
    duplicate.instance_id = 123;
    try std.testing.expectError(error.AmbiguousCrossReferenceTarget, resolve(123, &.{ first, duplicate }));
    duplicate.control_id = rules.id("%bmk");
    try std.testing.expectError(error.InvalidCrossReferenceObject, resolve(123, &.{ first, duplicate }));
}
