const Objects = @import("object_table.zig").Table;
const Grid = @import("grid_cells.zig").Grid;
const Backdrop = @import("backdrop.zig").Backdrop;
const Footnote = @import("footnote.zig").Footnote;
/// Only established inline objects, not a complete graph. Preserves the
/// selected initial registration order. Discard objects on failure.
pub fn register(objects: *Objects, grid: Grid, backdrop: Backdrop, footnote: Footnote) !void {
    for (grid.cells) |cell| switch (cell.value) {
        .empty => {},
        .number => |n| try objects.registerInitialNumber(.{ .object_id = cell.object_id.?, .bits = n.bits, .trailer = n.trailer, .payload_start = cell.payload_start.?, .payload_end = cell.payload_end.? }, cell.start, cell.end),
        .string => |s| try objects.registerInitialString(.{ .object_id = cell.object_id.?, .bytes = s.bytes, .trailer = s.trailer }, cell.start, cell.end),
    };
    for (backdrop.object_ids) |id| try objects.registerOther(id);
    for ([_]u32{ footnote.object_id, footnote.block.object_id, footnote.block.font.object_id } ++ footnote.section.backdrop.object_ids) |id|
        try objects.registerOther(id);
    try objects.registerInitialString(footnote.block.font.name, footnote.block.font.name_start, footnote.block.font.name_end);
    try objects.registerInitialString(footnote.block.text, footnote.block.text_start, footnote.block.text_end);
}
