//! Document-wide paragraph identity check before committing a created table.
const std = @import("std");
pub fn validate(session: *const @import("editor_session.zig").Session, table: *const @import("../model/created_table.zig").Table) !void {
    const a = session.allocator;
    var remaining = session.options.max_xml_bytes;
    for (session.sections) |section| {
        if (section.tree.source.len > remaining) return error.LimitExceeded;
        remaining -= section.tree.source.len;
    }
    const extras = try @import("paragraph_id_source_parts.zig").read(a, session.source, remaining);
    defer {
        for (extras) |*tree| tree.deinit(a);
        a.free(extras);
    }
    const count = try std.math.add(usize, session.sections.len, extras.len);
    const trees = try a.alloc(@import("xml_part_tree.zig").Tree, count);
    defer a.free(trees);
    var generated: std.ArrayList(u32) = .empty;
    defer generated.deinit(a);
    for (session.sections, trees[0..session.sections.len]) |section, *tree| {
        tree.* = section.tree;
        if (section.structure_values) |values| for (values.paragraphs) |paragraph| {
            if (paragraph.generated_id) |id| try generated.append(a, id);
        };
        for (section.created_tables.entries.items) |entry| for (entry.table.cells) |cell| {
            if (generated.items.len == session.options.max_sites) return error.LimitExceeded;
            try generated.append(a, cell.paragraph_id);
        };
    }
    @memcpy(trees[session.sections.len..], extras);
    if (table.cells.len > session.options.max_sites) return error.LimitExceeded;
    const incoming = try a.alloc(u32, table.cells.len);
    defer a.free(incoming);
    for (table.cells, incoming) |cell, *id| id.* = cell.paragraph_id;
    try @import("paragraph_instance_ids.zig").validateAdditional(a, trees, generated.items, incoming, session.options.max_sites);
}
