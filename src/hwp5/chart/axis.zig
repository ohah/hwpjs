const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const ids = @import("object_ids.zig");
const requireType = @import("type_checks.zig").require;
const texts = @import("text_block.zig");
const arrays = @import("array_header.zig");
const scales = @import("axis_scale.zig");
const tails = @import("axis_tail.zig");
pub const Options = struct { max_string_bytes: usize = 65535, max_total_string_bytes: usize = 7 * 65535 };
pub const Axis = struct {
    object_id: u32,
    raw: [82]u8,
    title: texts.Block,
    scale_array: arrays.Header,
    scale: ?scales.Scale,
    tail: tails.Tail,
    end: usize,
};
/// One selected Axis v3, not a fixed-four-axis loop. Raw bytes are copied and
/// Strings borrow retained input. Failure preserves reader; discard tables.
pub fn readObservedV3(reader: *Reader, types: *Types, objects: *Objects, options: Options) !Axis {
    var next = reader.*;
    const id = try ids.readInline(&next);
    try objects.registerOther(id);
    try requireType(types, &next, "VtAxis\x00", 3);
    const raw = (try next.take(82))[0..82].*;
    const selector = std.mem.readInt(u16, raw[6..8], .little);
    if (selector > 1) return error.UnsupportedChartAxisTailLayout;
    const title = try texts.readObservedWithObjects(&next, types, objects, .{ .max_string_bytes = options.max_string_bytes, .max_total_string_bytes = options.max_total_string_bytes });
    const remaining = options.max_total_string_bytes - title.font.name.bytes.len - title.text.bytes.len;
    const array = try arrays.readObservedV1(&next, types, objects);
    if (array.first_word != array.second_word or array.first_word > 1) return error.UnsupportedChartAxisScaleLayout;
    const scale = if (array.first_word == 1) try scales.readObservedV1(&next, types, objects, .{ .max_string_bytes = options.max_string_bytes, .max_total_string_bytes = remaining }) else null;
    const tail = try tails.readObserved(&next, types, selector);
    reader.* = next;
    return .{ .object_id = id, .raw = raw, .title = title, .scale_array = array, .scale = scale, .tail = tail, .end = next.offset };
}
