//! Transaction on the sole created-cell text owner, never a source paragraph.
const std = @import("std");
const editor = @import("editor_session.zig");
pub fn set(session: *editor.Session, section_index: usize, identity: u64, row: u32, column: u32, text: []const u8) !bool {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    if (identity == 0) return error.InvalidCreatedTableIdentity;
    const a = session.allocator;
    const values = &session.sections[section_index].created_tables;
    var found: ?usize = null;
    for (values.entries.items, 0..) |entry, index| if (entry.table.identity == identity) {
        if (found != null) return error.InvalidCreatedTableIdentity;
        found = index;
    };
    const index = found orelse return error.InvalidCreatedTableIdentity;
    _ = try values.entries.items[index].table.plan.cell(row, column);
    const encoded = try @import("../xml/text_writer.zig").encode(a, text, session.options.max_xml_bytes);
    defer a.free(encoded);
    const cell_index = try std.math.add(usize, try std.math.mul(usize, row, values.entries.items[index].table.plan.columns), column);
    if (cell_index >= values.entries.items[index].table.cells.len) return error.InvalidTableCell;
    if (std.mem.eql(u8, values.entries.items[index].table.cells[cell_index].text, text)) return false;
    var candidate = try values.clone(a);
    defer candidate.deinit(a);
    _ = try candidate.entries.items[index].table.replaceText(a, row, column, text, session.options.max_text_bytes);
    _ = try candidate.byteSize(session.options.max_xml_bytes);
    std.mem.swap(@import("created_table_values.zig").Values, values, &candidate);
    var committed = false;
    defer if (!committed) std.mem.swap(@import("created_table_values.zig").Values, values, &candidate);
    const saved = try session.save();
    a.free(saved);
    committed = true;
    return true;
}
