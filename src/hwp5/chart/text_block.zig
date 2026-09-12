const Reader = @import("../../binary/reader.zig").Reader;
const Table = @import("type_table.zig").Table;
const requireType = @import("type_checks.zig").require;
const fonts = @import("font.zig");
const strings = @import("string_object.zig");
const ids = @import("object_ids.zig");
const Objects = @import("object_table.zig").Table;
const backdrops = @import("backdrop.zig");
pub const Options = struct {
    max_string_bytes: usize = 65535,
    max_total_string_bytes: usize = 131070,
};
pub const Block = struct {
    object_id: u32,
    prefix: [12]u8,
    font: fonts.Font,
    middle: [24]u8,
    text: strings.String,
    suffix: [26]u8,
    end: usize,
    backdrop: ?backdrops.Backdrop = null,
    text_introduced: bool = true,
};

/// Explicit observed v2 block with a null auxiliary reference. String bytes
/// borrow input; raw fields are copied. Failure preserves reader, NOT table.
pub fn readObservedV2(reader: *Reader, table: *Table, options: Options) !Block {
    return read(reader, table, null, options);
}

/// Selected v2 with inline auxiliary Backdrop/empty Picture and String refs.
/// Caller retains all source buffers. Failure preserves reader but requires
/// disposal of both tables, which may have changed. Total counts both fields
/// even when they resolve to the same stored String.
pub fn readObservedWithObjects(reader: *Reader, table: *Table, objects: *Objects, options: Options) !Block {
    return read(reader, table, objects, options);
}

fn read(reader: *Reader, table: *Table, objects: ?*Objects, options: Options) !Block {
    var next = reader.*;
    const id = try ids.readInline(&next);
    if (objects) |o| try o.registerOther(id);
    try requireType(table, &next, "VtTextBlock\x00", 2);
    const prefix = (try next.take(12))[0..12].*;
    const backdrop = try readAuxiliary(&next, table, objects);
    const name_limit = @min(options.max_string_bytes, options.max_total_string_bytes);
    const font = if (objects) |o| try fonts.readObservedWithObjects(&next, table, o, name_limit) else try fonts.readObservedV1(&next, table, name_limit);
    const middle = (try next.take(24))[0..24].*;
    const text_limit = @min(options.max_string_bytes, options.max_total_string_bytes - font.name.bytes.len);
    var introduced = true;
    const text = if (objects) |o| blk: {
        const reference = try o.readStringObservedV1(&next, table, text_limit);
        introduced = reference.introduced;
        break :blk reference.value;
    } else try strings.readObservedV1(&next, table, text_limit);
    if (objects == null) try ids.requireUnique(&.{ id, font.object_id, font.name.object_id, text.object_id });
    const suffix = (try next.take(26))[0..26].*;
    try requireType(table, &next, "VtObject\x00", 1);
    reader.* = next;
    return .{ .object_id = id, .prefix = prefix, .font = font, .middle = middle, .text = text, .suffix = suffix, .end = next.offset, .backdrop = backdrop, .text_introduced = introduced };
}

fn readAuxiliary(reader: *Reader, table: *Table, objects: ?*Objects) !?backdrops.Backdrop {
    var peek = reader.*;
    if (try peek.readInt(u32) == 0xffffffff) {
        reader.* = peek;
        return null;
    }
    const scope = objects orelse return error.UnsupportedChartTextReference;
    const value = try backdrops.readObservedEmptyPicture(reader, table);
    for (value.object_ids) |id| try scope.registerOther(id);
    return value;
}
