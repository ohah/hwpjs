//! Native generated identity transaction. Original source-cell setters are not used.
const std = @import("std");
const editor = @import("editor_session.zig");
const p = @import("../model/border_fill_patch.zig");
const Request = @import("../model/created_cell_properties_values.zig").Request;
pub fn apply(session: *editor.Session, request: Request) !bool {
    const a = session.allocator;
    const section = request.address.section;
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    var found: ?usize = null;
    for (session.sections, 0..) |part, ordinal| for (part.created_tables.entries.items, 0..) |entry, i| if (entry.table.identity == request.address.identity) {
        if (found != null or ordinal != section or request.address.identity == 0) return error.InvalidCreatedTableIdentity;
        found = i;
    };
    const index = found orelse return error.InvalidCreatedTableIdentity;
    const live = &session.sections[section].created_tables;
    const entry = live.entries.items[index];
    // Re-resolve the current native host using the same source boundary authority.
    _ = try @import("created_table_anchor.zig").resolve(a, session, entry.anchor);
    var replacement = (try @import("../model/created_cell_properties_table.zig").prepareWithAlignmentBase(a, &entry.table, section, try session.createdCellPropertiesTicket(), request, session.options.max_xml_bytes, .top)) orelse return false;
    defer replacement.deinit(a);
    const property = &replacement.cell_properties[@as(usize, request.address.row) * replacement.plan.columns + request.address.column];
    if (p.has(property.appearance)) {
        var document = try @import("package.zig").inspectDocument(a, session.source, .{});
        defer document.deinit(a);
        var header = try document.readHeaderTree(a, .{});
        defer header.deinit(a);
        const node = try @import("border_fill_resource_patch.zig").sourceNode(a, &header, replacement.resources.border_fill);
        var mask: [4]bool = @splat(false);
        for (property.appearance.border.edges, 0..) |edge, i| mask[i] = edge != null;
        const observed = try @import("border_fill_xml_patch.zig").observeSelectedWithDiagonal(a, &header, node, try @import("table_cell_background_session.zig").profile(session), mask, property.appearance.background != null, property.appearance.diagonal);
        property.appearance = p.canonical(observed, property.appearance);
    }
    var candidate = try live.clone(a);
    defer candidate.deinit(a);
    std.mem.swap(@import("../model/created_table.zig").Table, &candidate.entries.items[index].table, &replacement);
    _ = try candidate.byteSize(session.options.max_xml_bytes);
    const before = try session.save();
    defer a.free(before);
    std.mem.swap(@import("created_table_values.zig").Values, live, &candidate);
    var committed = false;
    defer if (!committed) std.mem.swap(@import("created_table_values.zig").Values, live, &candidate);
    const after = try session.save();
    defer a.free(after);
    try @import("created_table_saved_formulas.zig").validate(session, after);
    if (std.mem.eql(u8, before, after)) return false;
    committed = true;
    return true;
}
