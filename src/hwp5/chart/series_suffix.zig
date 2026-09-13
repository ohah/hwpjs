const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const blocks = @import("text_block.zig");
const formats = @import("text_format.zig");
pub const Options = struct { text: blocks.Options = .{}, max_code_bytes: usize = 65535 };
pub const Suffix = struct { block: blocks.NullableBlock, raw_word: u16, formats: [2]formats.NullableFormat, end: usize };

/// Selected inline TextBlock and two nullable formats. The intervening word
/// is opaque, NOT a count. Failure preserves reader; discard both tables.
pub fn readObserved(reader: *Reader, types: *Types, objects: *Objects, options: Options) !Suffix {
    var next = reader.*;
    const block = try blocks.readNullableObservedWithObjects(&next, types, objects, options.text);
    const word = try next.readInt(u16);
    var items: [2]formats.NullableFormat = undefined;
    for (&items) |*item| item.* = try formats.readNullableObservedV1(&next, types, objects, options.max_code_bytes);
    reader.* = next;
    return .{ .block = block, .raw_word = word, .formats = items, .end = next.offset };
}
