//! Transient definition/result serialization. No session, binding, or cache authority.
const std = @import("std");
const field = @import("../body/field_start.zig");
const format = @import("../body/formula_format.zig");

/// expression is counted UTF16LE without '='; value must be freshly evaluated
/// by the caller against the transaction-owned current model.
pub fn prepare(a: std.mem.Allocator, properties: field.Properties, expression: []const u8, value: f64, grouping: format.Grouping) ![]u8 {
    if (expression.len > 4096) return error.LimitExceeded;
    _ = try @import("../body/formula_range.zig").Range.parse(expression);
    const previous = try properties.formulaView();
    const tail = properties.command[2 + previous.expression.len ..];
    const length = std.math.add(usize, 2 + expression.len, tail.len) catch return error.LimitExceeded;
    if (length / 2 > std.math.maxInt(u16)) return error.LimitExceeded;
    const command = try a.alloc(u8, length);
    defer a.free(command);
    @memcpy(command[0..2], properties.command[0..2]);
    @memcpy(command[2..][0..expression.len], expression);
    @memcpy(command[2 + expression.len ..], tail);
    var current = properties;
    current.command = command;
    if (!std.mem.eql(u8, expression, previous.expression)) current.attributes |= field.modified_mask;
    // The shared writer replaces the old display cache, preserving the format,
    // instance ID, other byte, unknown attributes and opaque field tail.
    return @import("formula_command_writer.zig").prepare(a, current, value, grouping);
}
