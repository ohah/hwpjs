//! Named field iteration shared by binary projections and model comparisons.
//! Only names/types/enum values are exposed; layout attributes stay with Zig.
fn FieldArray(comptime T: type) type {
    return switch (@typeInfo(T)) {
        .@"struct" => |info| [info.field_names.len]struct { name: [:0]const u8, type: type },
        .@"enum" => |info| [info.field_names.len]struct { name: [:0]const u8, value: comptime_int },
        else => @compileError("Expected a struct or enum"),
    };
}

pub fn fields(comptime T: type) FieldArray(T) {
    const info = @typeInfo(T);
    var result: FieldArray(T) = undefined;
    switch (info) {
        .@"struct" => |container| {
            inline for (container.field_names, container.field_types, 0..) |name, field_type, i| {
                result[i] = .{ .name = name, .type = field_type };
            }
        },
        .@"enum" => |container| {
            inline for (container.field_names, container.field_values, 0..) |name, value, i| {
                result[i] = .{ .name = name, .value = value };
            }
        },
        else => unreachable,
    }
    return result;
}
