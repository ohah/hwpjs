//! Serialize authoritative created-table values; no mutation of source trees.
const std = @import("std");
const model = @import("../model/created_table.zig");

const Builder = struct {
    a: std.mem.Allocator,
    bytes: std.ArrayList(u8) = .empty,
    limit: usize,
    fn append(self: *Builder, text: []const u8) !void {
        if (text.len > self.limit -| self.bytes.items.len) return error.LimitExceeded;
        try self.bytes.appendSlice(self.a, text);
    }
    fn print(self: *Builder, comptime format: []const u8, args: anytype) !void {
        var buffer: [2048]u8 = undefined;
        try self.append(try std.fmt.bufPrint(&buffer, format, args));
    }
};

/// Self-contained hp namespace, unmerged inline grid, no invented line cache.
pub fn write(a: std.mem.Allocator, table: *const model.Table, max_bytes: usize) ![]u8 {
    _ = try @import("../model/table_creation_plan.zig").create(table.plan.rows, table.plan.columns, table.plan.width, table.plan.row_height, 100000);
    if (table.identity == 0 or table.instance_id == 0) return error.InvalidCreatedTableIdentity;
    if (table.cells.len != try std.math.mul(usize, table.plan.rows, table.plan.columns)) return error.InvalidTableParagraphIds;
    var used: std.AutoHashMap(u32, void) = .init(a);
    defer used.deinit();
    for (table.cells) |cell| {
        if (cell.paragraph_id == 0 or (try used.getOrPut(cell.paragraph_id)).found_existing) return error.InvalidTableParagraphIds;
    }
    const extent = try table.extent();
    var output: Builder = .{ .a = a, .limit = max_bytes };
    defer output.bytes.deinit(a);
    try output.print("<hp:tbl xmlns:hp=\"http://www.hancom.co.kr/hwpml/2011/paragraph\" id=\"{d}\" zOrder=\"0\" numberingType=\"TABLE\" textWrap=\"TOP_AND_BOTTOM\" textFlow=\"BOTH_SIDES\" lock=\"0\" dropcapstyle=\"None\" pageBreak=\"CELL\" repeatHeader=\"0\" rowCnt=\"{d}\" colCnt=\"{d}\" cellSpacing=\"0\" borderFillIDRef=\"{d}\" noAdjust=\"0\">", .{ table.instance_id, table.plan.rows, table.plan.columns, table.resources.border_fill });
    try output.print("<hp:sz width=\"{d}\" widthRelTo=\"ABSOLUTE\" height=\"{d}\" heightRelTo=\"ABSOLUTE\" protect=\"0\"/>", .{ extent.width, extent.height });
    try output.append("<hp:pos treatAsChar=\"1\" affectLSpacing=\"0\" flowWithText=\"1\" allowOverlap=\"0\" holdAnchorAndSO=\"0\" vertRelTo=\"PARA\" horzRelTo=\"COLUMN\" vertAlign=\"TOP\" horzAlign=\"LEFT\" vertOffset=\"0\" horzOffset=\"0\"/><hp:outMargin left=\"0\" right=\"0\" top=\"0\" bottom=\"0\"/><hp:inMargin left=\"0\" right=\"0\" top=\"0\" bottom=\"0\"/>");
    for (0..table.plan.rows) |row| {
        try output.append("<hp:tr>");
        for (0..table.plan.columns) |column| {
            const geometry = try table.cell(@intCast(row), @intCast(column));
            const cell = table.cells[row * table.plan.columns + column];
            const alignment = (try table.cellVerticalAlignment(@intCast(row), @intCast(column), .top)).?;
            try output.print("<hp:tc name=\"\" header=\"0\" hasMargin=\"0\" protect=\"0\" editable=\"0\" dirty=\"0\" borderFillIDRef=\"{d}\"><hp:subList id=\"\" textDirection=\"HORIZONTAL\" lineWrap=\"BREAK\" vertAlign=\"{s}\" linkListIDRef=\"0\" linkListNextIDRef=\"0\" textWidth=\"0\" textHeight=\"0\" hasTextRef=\"0\" hasNumRef=\"0\"><hp:p id=\"{d}\" paraPrIDRef=\"{d}\" styleIDRef=\"{d}\" pageBreak=\"0\" columnBreak=\"0\" merged=\"0\">", .{ try table.cellBorderFill(@intCast(row), @intCast(column)), @import("../model/cell_vertical_alignment.zig").text(alignment), cell.paragraph_id, table.resources.paragraph, table.resources.style });
            var run_scratch: [1]@import("../model/document.zig").CharacterRun = undefined;
            var spans = try cell.spans(table.resources.character, &run_scratch);
            while (try spans.next()) |span| {
                try output.print("<hp:run charPrIDRef=\"{d}\"><hp:t>", .{span.char_shape_id});
                const encoded = try @import("created_cell_text_xml.zig").encode(a, span.text, max_bytes -| output.bytes.items.len);
                defer a.free(encoded);
                try output.append(encoded);
                try output.append("</hp:t></hp:run>");
            }
            try output.print("</hp:p></hp:subList><hp:cellAddr colAddr=\"{d}\" rowAddr=\"{d}\"/><hp:cellSpan colSpan=\"1\" rowSpan=\"1\"/><hp:cellSz width=\"{d}\" height=\"{d}\"/><hp:cellMargin left=\"0\" right=\"0\" top=\"0\" bottom=\"0\"/></hp:tc>", .{ column, row, geometry.width, geometry.height });
        }
        try output.append("</hp:tr>");
    }
    try output.append("</hp:tbl>");
    return output.bytes.toOwnedSlice(a);
}
