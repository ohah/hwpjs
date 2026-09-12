const Reader = @import("../../binary/reader.zig").Reader;
const Table = @import("type_table.zig").Table;
const requireType = @import("type_checks.zig").require;
const blocks = @import("text_block.zig");
const sections = @import("chart_section.zig");
const ids = @import("object_ids.zig");
pub const Footnote = struct { object_id: u32, block: blocks.Block, section: sections.Section, end: usize };

/// Selected observed v1 Footnote/ChartText layout, not an automatic recognizer.
/// Borrows the block's strings and copies opaque fields. Failure preserves the
/// cursor but requires caller disposal of the serialization type table.
pub fn readObservedV1(reader: *Reader, table: *Table, options: blocks.Options) !Footnote {
    var next = reader.*;
    const id = try ids.readInline(&next);
    try requireType(table, &next, "VtChartFootnote\x00", 1);
    try requireType(table, &next, "VtChartText\x00", 1);
    const block = try blocks.readObservedV2(&next, table, options);
    const section = try sections.readObservedV1(&next, table);
    try ids.requireUnique(&(@as([5]u32, .{ id, block.object_id, block.font.object_id, block.font.name.object_id, block.text.object_id }) ++ section.backdrop.object_ids));
    reader.* = next;
    return .{ .object_id = id, .block = block, .section = section, .end = next.offset };
}
