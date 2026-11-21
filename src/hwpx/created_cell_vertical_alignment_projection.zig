//! Read generated cells through current native anchors, not source-node aliases.
const std = @import("std");
pub fn read(a: std.mem.Allocator, session: *const @import("editor_session.zig").Session) ![]u8 {
    var builder = @import("../model/created_cell_vertical_alignment_projection.zig").Builder.init(a, session.options.max_xml_bytes);
    defer builder.deinit();
    for (session.sections, 0..) |part, section| for (part.created_tables.entries.items) |entry| {
        _ = try @import("created_table_anchor.zig").resolve(a, session, entry.anchor);
        try builder.appendTable(section, &entry.table, .top);
    };
    return builder.json("hwpx");
}
