const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const requireType = @import("type_checks.zig").require;
const ids = @import("object_ids.zig");
const String = @import("string_object.zig").String;

pub const Format = FormatType(false);
pub const NullableFormat = FormatType(true);
fn FormatType(comptime nullable: bool) type {
    return struct {
        object_id: u32,
        raw_word: u16,
        code: if (nullable) ?String else String,
        code_introduced: bool,
        code_start: usize,
        code_end: usize,
        end: usize,
    };
}

/// Selected inline TextFormat v1, not a general object-reference resolver.
/// VtObject precedes own fields in this observed serialization.
/// Code borrows caller-retained input. On error discard both tables; reader
/// remains unchanged. Null belongs to the enclosing optional field.
pub fn readObservedV1(reader: *Reader, types: *Types, objects: *Objects, max_code_bytes: usize) !Format {
    return read(false, reader, types, objects, max_code_bytes);
}

/// Explicit selected nullable-code variant. Null consumes only its sentinel,
/// stores no String and is not introduced. Empty/alias retain their identity.
/// Required-code API and failure/lifetime contracts remain unchanged.
pub fn readNullableObservedV1(reader: *Reader, types: *Types, objects: *Objects, max_code_bytes: usize) !NullableFormat {
    return read(true, reader, types, objects, max_code_bytes);
}

fn read(comptime nullable: bool, reader: *Reader, types: *Types, objects: *Objects, max_code_bytes: usize) !FormatType(nullable) {
    var next = reader.*;
    const id = try ids.readInline(&next);
    try objects.registerOther(id);
    try requireType(types, &next, "VtTextFormat\x00", 1);
    try requireType(types, &next, "VtObject\x00", 1);
    const raw_word = try next.readInt(u16);
    var introduced = false;
    var code_start = next.offset;
    var code_end: usize = undefined;
    const code: ?String = blk: {
        if (nullable) {
            var peek = next;
            if (try peek.readInt(u32) == 0xffffffff) {
                next = peek;
                code_end = next.offset;
                break :blk null;
            }
        }
        const ref = try objects.readStringObservedV1(&next, types, max_code_bytes);
        introduced = ref.introduced;
        code_start = ref.start;
        code_end = ref.end;
        break :blk ref.value;
    };
    reader.* = next;
    return .{ .object_id = id, .raw_word = raw_word, .code = if (nullable) code else code.?, .code_introduced = introduced, .code_start = code_start, .code_end = code_end, .end = next.offset };
}
