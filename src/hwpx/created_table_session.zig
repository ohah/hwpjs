//! Internal staging transaction. Public insertion still waits for projection.
const std = @import("std");
const editor = @import("editor_session.zig");
const model = @import("../model/created_table.zig");

pub fn stage(session: *editor.Session, section_index: usize, paragraph: usize, unit: u32, table: *const model.Table) !bool {
    const a = session.allocator;
    const anchor = try @import("created_table_anchor.zig").capture(a, session, section_index, paragraph, unit);
    try @import("created_table_object_ids.zig").validateCurrent(session, table.identity, table.instance_id);
    try @import("created_table_source_ids.zig").validate(session, table);
    try @import("created_table_resources.zig").validate(session, table.resources);
    const validation = try @import("created_table_xml.zig").write(a, table, session.options.max_xml_bytes);
    defer a.free(validation);
    const section = &session.sections[section_index];
    var candidate = try section.created_tables.clone(a);
    defer candidate.deinit(a);
    try candidate.append(a, anchor, table, 100000);
    _ = try candidate.byteSize(session.options.max_xml_bytes);
    std.mem.swap(@import("created_table_values.zig").Values, &section.created_tables, &candidate);
    var committed = false;
    defer if (!committed) std.mem.swap(@import("created_table_values.zig").Values, &section.created_tables, &candidate);
    const saved = try session.save();
    a.free(saved);
    committed = true;
    return true;
}
