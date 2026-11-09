//! Native transaction for owned generated, unmerged tables only.
const std = @import("std");
const editor = @import("editor_session.zig");
const sharedgrid = @import("../model/created_table_grid.zig");
const Values = @import("created_table_values.zig").Values;

pub fn apply(session: *editor.Session, section: usize, identity: u64, command: sharedgrid.Command) !bool {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    if (identity == 0) return error.InvalidCreatedTableIdentity;
    var found: ?usize = null;
    for (session.sections, 0..) |part, part_index| {
        for (part.created_tables.entries.items, 0..) |entry, index| {
            if (entry.table.identity != identity) continue;
            if (found != null or part_index != section) return error.InvalidCreatedTableIdentity;
            found = index;
        }
    }
    const index = found orelse return error.InvalidCreatedTableIdentity;
    const a = session.allocator;
    const values = &session.sections[section].created_tables;
    const source = &values.entries.items[index].table;
    const inserted: usize = switch (command) {
        .insert_row => source.plan.columns,
        .insert_column => source.plan.rows,
        .delete_row, .delete_column => 0,
    };
    // The planner inventories source parts and current generated paragraphs.
    // Its fresh table identity/instance are intentionally not adopted here.
    var ids: ?@import("created_table_source_ids.zig").Plan = null;
    defer if (ids) |*plan| plan.deinit(a);
    if (inserted != 0) ids = try @import("created_table_source_ids.zig").plan(session, inserted);
    var candidate = try values.clone(a);
    defer candidate.deinit(a);
    const edited = try sharedgrid.edit(a, source, command, if (ids) |plan| plan.paragraph_ids else &.{}, .{
        .max_cells = @min(@as(usize, 100000), session.options.max_sites),
        .max_text_bytes = session.options.max_text_bytes,
    });
    candidate.entries.items[index].table.deinit(a);
    candidate.entries.items[index].table = edited;
    const fragment = try @import("created_table_xml.zig").write(a, &candidate.entries.items[index].table, session.options.max_xml_bytes);
    defer a.free(fragment);
    _ = try candidate.byteSize(session.options.max_xml_bytes);
    std.mem.swap(Values, values, &candidate);
    var committed = false;
    defer if (!committed) std.mem.swap(Values, values, &candidate);
    const saved = try session.save();
    defer a.free(saved);
    try @import("created_table_saved_formulas.zig").validate(session, saved);
    committed = true;
    return true;
}
