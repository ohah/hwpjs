const Reader = @import("../../binary/reader.zig").Reader;
const Table = @import("type_table.zig").Table;
const requireType = @import("type_checks.zig").require;
const fonts = @import("font.zig");
const strings = @import("string_object.zig");
const Objects = @import("object_table.zig").Table;
const backdrops = @import("backdrop.zig");
const ids = @import("object_ids.zig");
pub const Options = struct {
    max_string_bytes: usize = 65535,
    max_total_string_bytes: usize = 131070,
};
pub const Body = struct {
    prefix: [12]u8,
    font: fonts.Font,
    middle: [24]u8,
    text: ?strings.String,
    suffix: [26]u8,
    end: usize,
    backdrop: ?backdrops.Backdrop,
    text_introduced: bool,
    text_start: usize,
    text_end: usize,
};

/// Selected base-class body starts at VtTextBlock v2, with no object ID.
/// Null text is distinct from an empty String. Raw values are copied; Strings
/// borrow caller-retained buffers. Failure preserves reader, not either table.
pub fn readObservedV2(reader: *Reader, table: *Table, objects: *Objects, options: Options) !Body {
    return read(reader, table, objects, options, true, null);
}

/// Shared required-text path for existing inline TextBlock entry points.
pub fn readRequired(reader: *Reader, table: *Table, objects: ?*Objects, options: Options, inline_id: u32) !Body {
    return read(reader, table, objects, options, false, inline_id);
}

fn read(reader: *Reader, table: *Table, objects: ?*Objects, options: Options, allow_null: bool, inline_id: ?u32) !Body {
    var next = reader.*;
    try requireType(table, &next, "VtTextBlock\x00", 2);
    const prefix = (try next.take(12))[0..12].*;
    const backdrop = try readAuxiliary(&next, table, objects);
    const name_limit = @min(options.max_string_bytes, options.max_total_string_bytes);
    const font = if (objects) |o| try fonts.readObservedWithObjects(&next, table, o, name_limit) else try fonts.readObservedV1(&next, table, name_limit);
    const middle = (try next.take(24))[0..24].*;
    const text_limit = @min(options.max_string_bytes, options.max_total_string_bytes - font.name.bytes.len);
    var introduced = false;
    var text_start = next.offset;
    var text_end: usize = undefined;
    var peek = next;
    const text: ?strings.String = if (allow_null and try peek.readInt(u32) == 0xffffffff) blk: {
        next = peek;
        text_end = next.offset;
        break :blk null;
    } else if (objects) |o| blk: {
        const reference = try o.readStringObservedV1(&next, table, text_limit);
        introduced = reference.introduced;
        text_start = reference.start;
        text_end = reference.end;
        break :blk reference.value;
    } else blk: {
        introduced = true;
        const value = try strings.readObservedV1(&next, table, text_limit);
        text_end = next.offset;
        break :blk value;
    };
    // Preserve legacy duplicate-vs-truncation precedence before reading tail.
    if (inline_id) |id| if (objects == null) try ids.requireUnique(&.{ id, font.object_id, font.name.object_id, text.?.object_id });
    const suffix = (try next.take(26))[0..26].*;
    try requireType(table, &next, "VtObject\x00", 1);
    reader.* = next;
    return .{ .prefix = prefix, .font = font, .middle = middle, .text = text, .suffix = suffix, .end = next.offset, .backdrop = backdrop, .text_introduced = introduced, .text_start = text_start, .text_end = text_end };
}

fn readAuxiliary(reader: *Reader, table: *Table, objects: ?*Objects) !?backdrops.Backdrop {
    var peek = reader.*;
    if (try peek.readInt(u32) == 0xffffffff) {
        reader.* = peek;
        return null;
    }
    const scope = objects orelse return error.UnsupportedChartTextReference;
    return try backdrops.readObservedEmptyPictureWithObjects(reader, table, scope);
}
