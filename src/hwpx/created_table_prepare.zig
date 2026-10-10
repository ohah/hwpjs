//! Detached creation payload; stage/history remains the only commit boundary.
const std = @import("std");
const model = @import("../model/created_table.zig");
pub fn prepare(session: *const @import("editor_session.zig").Session, section: usize, paragraph: usize, unit: u32, rows: u32, columns: u32, width: u32, row_height: u32, resources: model.Resources) !model.Table {
    const a = session.allocator;
    _ = try @import("created_table_anchor.zig").capture(a, session, section, paragraph, unit);
    const geometry = try @import("../model/table_creation_plan.zig").create(rows, columns, width, row_height, 100000);
    try @import("created_table_resources.zig").validate(session, resources);
    var ids = try @import("created_table_source_ids.zig").plan(session, try std.math.mul(usize, rows, columns));
    defer ids.deinit(a);
    return model.create(a, ids.identity, ids.instance_id, geometry, ids.paragraph_ids, resources, 100000);
}
