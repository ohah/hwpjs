const std = @import("std");
const Contents = @import("observed_contents.zig").Contents;
const Objects = @import("object_table.zig");

pub fn requireUniqueReference(objects: *const Objects.Table, object_id: u32) !void {
    var references: usize = 0;
    for (objects.references.items) |candidate| references += @intFromBool(candidate.object_id == object_id);
    if (references != 1) return error.SharedChartNumberObject;
}

/// Rewrites the fixed-width payload of one registered Double object. This is
/// object-global; semantic adapters must reject shared identities when they
/// promise target-local behavior.
pub fn replacement(a: std.mem.Allocator, value: *const Contents, reference: *const Objects.ValueReference, bits: u64, trailer: u16) ![]u8 {
    const number = switch (reference.value) {
        .number => |number| number,
        else => return error.ExpectedChartNumber,
    };
    const registered = switch (value.prefix.objects.entries.get(number.object_id) orelse return error.InvalidChartNumberSource) {
        .number => |stored| stored,
        else => return error.InvalidChartNumberSource,
    };
    if (registered.object_id != number.object_id or registered.bits != number.bits or registered.trailer != number.trailer or registered.payload_start != number.payload_start or registered.payload_end != number.payload_end)
        return error.InvalidChartNumberSource;
    if (number.payload_start > number.payload_end or number.payload_end > value.source.len or number.payload_end - number.payload_start != 10)
        return error.InvalidChartNumberSource;
    if (std.mem.readInt(u64, value.source[number.payload_start..][0..8], .little) != number.bits or std.mem.readInt(u16, value.source[number.payload_start + 8 ..][0..2], .little) != number.trailer)
        return error.InvalidChartNumberSource;
    const output = try a.alloc(u8, 10);
    std.mem.writeInt(u64, output[0..8], bits, .little);
    std.mem.writeInt(u16, output[8..10], trailer, .little);
    return output;
}
