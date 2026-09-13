const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig");
const formats = @import("text_format.zig");
const bodies = @import("text_block_body.zig");
const requireType = @import("type_checks.zig").require;

pub const Options = struct {
    max_string_bytes: usize = 65535,
    max_total_string_bytes: usize = 5 * 65535,
};
pub const Block = struct {
    header_word: u32,
    reference: ?Objects.ValueReference,
    format: ?formats.Format,
    format_start: usize,
    format_end: usize,
    raw_before_label: u16,
    label: Objects.Reference,
    raw_suffix: [3]u8,
    text: bodies.Body,
    end: usize,
};

/// Starts at the raw word before VtValueBlock v1, after the enclosing slots.
/// The raw word is NOT an object ID (observed 65536 repeats in one chart).
/// Total String budget counts each field even if it aliases another field;
/// the caller-owned object table separately counts unique String storage.
/// Failure preserves reader but requires discarding both caller-owned tables.
pub fn readObservedV1(reader: *Reader, types: *Types, objects: *Objects.Table, options: Options) !Block {
    var next = reader.*;
    const header = try next.readInt(u32);
    try requireType(types, &next, "VtValueBlock\x00", 1);
    var remaining = options.max_total_string_bytes;
    const reference = if (try consumeNull(&next)) null else try objects.readValueObservedV1(&next, types, @min(options.max_string_bytes, remaining));
    if (reference) |r| switch (r.value) {
        .string => |s| remaining -= s.bytes.len,
        .number => {},
    };
    const format_start = next.offset;
    const format = if (try consumeNull(&next)) null else try formats.readObservedV1(&next, types, objects, @min(options.max_string_bytes, remaining));
    const format_end = next.offset;
    if (format) |f| remaining -= f.code.bytes.len;
    const raw_before_label = try next.readInt(u16);
    const label = try objects.readStringObservedV1(&next, types, @min(options.max_string_bytes, remaining));
    remaining -= label.value.bytes.len;
    const raw_suffix = (try next.take(3))[0..3].*;
    const body = try bodies.readObservedV2(&next, types, objects, .{ .max_string_bytes = options.max_string_bytes, .max_total_string_bytes = remaining });
    reader.* = next;
    return .{ .header_word = header, .reference = reference, .format = format, .format_start = format_start, .format_end = format_end, .raw_before_label = raw_before_label, .label = label, .raw_suffix = raw_suffix, .text = body, .end = next.offset };
}

// Peeking never consumes a non-null ID. Nullable Value/Format fields share this
// boundary; their consumers retain their own identity and version checks.
fn consumeNull(reader: *Reader) !bool {
    var peek = reader.*;
    if (try peek.readInt(u32) != 0xffffffff) return false;
    reader.* = peek;
    return true;
}
