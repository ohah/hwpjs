const Reader = @import("../../binary/reader.zig").Reader;
const Table = @import("type_table.zig").Table;
const bodies = @import("text_block_body.zig");
const fonts = @import("font.zig");
const strings = @import("string_object.zig");
const ids = @import("object_ids.zig");
const Objects = @import("object_table.zig").Table;
const backdrops = @import("backdrop.zig");
pub const Options = bodies.Options;
pub const Block = BlockType(false);
pub const NullableBlock = BlockType(true);
fn BlockType(comptime nullable: bool) type {
    return struct {
        object_id: u32,
        prefix: [12]u8,
        font: fonts.Font,
        middle: [24]u8,
        text: if (nullable) ?strings.String else strings.String,
        suffix: [26]u8,
        end: usize,
        backdrop: ?backdrops.Backdrop = null,
        text_introduced: bool = true,
    };
}

/// Explicit observed v2 block with a null auxiliary reference. String bytes
/// borrow input; raw fields are copied. Failure preserves reader, NOT table.
pub fn readObservedV2(reader: *Reader, table: *Table, options: Options) !Block {
    return read(false, reader, table, null, options);
}

/// Selected v2 with inline auxiliary Backdrop/empty Picture and String refs.
/// Caller retains all source buffers. Failure preserves reader but requires
/// disposal of both tables, which may have changed. Total counts both fields
/// even when they resolve to the same stored String.
pub fn readObservedWithObjects(reader: *Reader, table: *Table, objects: *Objects, options: Options) !Block {
    return read(false, reader, table, objects, options);
}

/// Explicit inline v2 with nullable text, preserving null versus empty String.
/// Shared identity and failure contracts match the required-text entry point.
pub fn readNullableObservedWithObjects(reader: *Reader, table: *Table, objects: *Objects, options: Options) !NullableBlock {
    return read(true, reader, table, objects, options);
}

fn read(comptime nullable: bool, reader: *Reader, table: *Table, objects: ?*Objects, options: Options) !BlockType(nullable) {
    var next = reader.*;
    const id = try ids.readInline(&next);
    if (objects) |o| try o.registerOther(id);
    const body = if (nullable) try bodies.readObservedV2(&next, table, objects.?, options) else try bodies.readRequired(&next, table, objects, options, id);
    const text = if (nullable) body.text else body.text.?;
    reader.* = next;
    return .{ .object_id = id, .prefix = body.prefix, .font = body.font, .middle = body.middle, .text = text, .suffix = body.suffix, .end = next.offset, .backdrop = body.backdrop, .text_introduced = body.text_introduced };
}
