const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const arrays = @import("array_header.zig");
const values = @import("value_block.zig");
const ids = @import("object_ids.zig");
const requireType = @import("type_checks.zig").require;
pub const Scale = struct { object_id: u32, array: arrays.Header, value: values.Block, end: usize };
/// Selected AxisScaleBlock v1: array words 5/0 then five null slots and one
/// embedded ValueBlock. Does not infer a universal array capacity/count rule.
pub fn readObservedV1(reader: *Reader, types: *Types, objects: *Objects, options: values.Options) !Scale {
    var next = reader.*;
    const id = try ids.readInline(&next);
    try objects.registerOther(id);
    try requireType(types, &next, "VtAxisScaleBlock\x00", 1);
    const array = try arrays.readObservedV1(&next, types, objects);
    if (array.first_word != 5 or array.second_word != 0) return error.UnsupportedChartAxisScaleLayout;
    for (0..5) |_| if (try next.readInt(u32) != 0xffffffff) return error.UnsupportedChartAxisScaleLayout;
    const value = try values.readObservedV1(&next, types, objects, options);
    reader.* = next;
    return .{ .object_id = id, .array = array, .value = value, .end = next.offset };
}
