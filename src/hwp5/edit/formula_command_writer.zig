//! Prepare a transient field payload from the current formatted result.
//! No mutable command cache, model mutation, or record framing here.
const std = @import("std");
const field = @import("../body/field_start.zig");

pub fn prepare(a: std.mem.Allocator, properties: field.Properties, value: f64, grouping: @import("../body/formula_format.zig").Grouping) ![]u8 {
    const view = try properties.formulaView();
    const format = try @import("../body/formula_format.zig").Format.parse(view.format);
    const rendered = try format.render(a, value, grouping);
    defer a.free(rendered);
    const prefix = properties.command.len - view.cached_display.len;
    const result_bytes = std.math.mul(usize, rendered.len, 2) catch return error.LimitExceeded;
    const command_len = std.math.add(usize, prefix, result_bytes) catch return error.LimitExceeded;
    if (command_len / 2 > std.math.maxInt(u16)) return error.LimitExceeded;
    const command = try a.alloc(u8, command_len);
    defer a.free(command);
    @memcpy(command[0..prefix], properties.command[0..prefix]);
    for (rendered, 0..) |c, i| std.mem.writeInt(u16, command[prefix + i * 2 ..][0..2], c, .little);
    const changed = !std.mem.eql(u8, command, properties.command);
    return properties.withCommand(a, command, properties.attributes | (if (changed) field.modified_mask else @as(u32, 0)));
}
