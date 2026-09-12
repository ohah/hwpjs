const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const requireType = @import("type_checks.zig").require;
const ids = @import("object_ids.zig");
const String = @import("string_object.zig").String;

pub const Format = struct {
    object_id: u32,
    raw_word: u16,
    code: String,
    code_introduced: bool,
    end: usize,
};

/// Selected inline TextFormat v1, not a general object-reference resolver.
/// VtObject precedes own fields in this observed serialization.
/// Code borrows caller-retained input. On error discard both tables; reader
/// remains unchanged. Null belongs to the enclosing optional field.
pub fn readObservedV1(reader: *Reader, types: *Types, objects: *Objects, max_code_bytes: usize) !Format {
    var next = reader.*;
    const id = try ids.readInline(&next);
    try objects.registerOther(id);
    try requireType(types, &next, "VtTextFormat\x00", 1);
    try requireType(types, &next, "VtObject\x00", 1);
    const raw_word = try next.readInt(u16);
    const code = try objects.readStringObservedV1(&next, types, max_code_bytes);
    reader.* = next;
    return .{ .object_id = id, .raw_word = raw_word, .code = code.value, .code_introduced = code.introduced, .end = next.offset };
}
