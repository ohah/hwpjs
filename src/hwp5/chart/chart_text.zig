const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const requireType = @import("type_checks.zig").require;
const blocks = @import("text_block.zig");
const sections = @import("chart_section.zig");
pub const Options = blocks.Options;
pub const Text = TextType(false);
pub const NullableText = TextType(true);
fn TextType(comptime nullable: bool) type {
    return struct { block: if (nullable) blocks.NullableBlock else blocks.Block, section: sections.Section, end: usize };
}

/// Required-text component used by the legacy Footnote path. The enclosing
/// reader must validate cross-component IDs (Footnote does so after this read).
/// ChartText and ChartSection bases have no leading object IDs. Raw fields
/// are copied, Strings borrow retained input. Failure preserves reader;
/// the type table may have changed and must be discarded.
pub fn readObservedV1(reader: *Reader, types: *Types, options: Options) !Text {
    return read(false, reader, types, null, options);
}

/// Explicit nullable text plus whole identity scope. Null/empty/alias stay
/// distinct. On failure discard both tables; reader is unchanged.
pub fn readNullableObservedWithObjects(reader: *Reader, types: *Types, objects: *Objects, options: Options) !NullableText {
    return read(true, reader, types, objects, options);
}

fn read(comptime nullable: bool, reader: *Reader, types: *Types, objects: ?*Objects, options: Options) !TextType(nullable) {
    var next = reader.*;
    try requireType(types, &next, "VtChartText\x00", 1);
    const block = if (nullable) try blocks.readNullableObservedWithObjects(&next, types, objects.?, options) else try blocks.readObservedV2(&next, types, options);
    const section = if (objects) |o| try sections.readObservedWithObjects(&next, types, o) else try sections.readObservedV1(&next, types);
    reader.* = next;
    return .{ .block = block, .section = section, .end = next.offset };
}
