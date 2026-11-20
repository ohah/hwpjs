//! Resolve created-table references without treating sparse IDs as indices.
const std = @import("std");
pub fn validate(session: *const @import("editor_session.zig").Session, resources: @import("../model/created_table.zig").Resources) !void {
    const a = session.allocator;
    var options = try @import("created_table_resource_options.zig").read(session);
    defer options.deinit(a);
    if (std.mem.indexOfScalar(u32, options.paragraph, resources.paragraph) == null) return error.InvalidParagraphShapeReference;
    if (std.mem.indexOfScalar(u32, options.character, resources.character) == null) return error.InvalidCharacterShapeReference;
    if (std.mem.indexOfScalar(u32, options.style, resources.style) == null) return error.InvalidStyleReference;
    if (std.mem.indexOfScalar(u32, options.border_fill, resources.border_fill) == null) return error.InvalidBorderFillReference;
}

/// Current sparse IDs are resources, never array indices. Build one set per
/// detached table validation, then visit each canonical paragraph/run once.
pub fn validateTable(session: *const @import("editor_session.zig").Session, table: *const @import("../model/created_table.zig").Table) !void {
    try validate(session, table.resources);
    const a = session.allocator;
    var options = try @import("created_table_resource_options.zig").read(session);
    defer options.deinit(a);
    var known = std.AutoHashMap(u32, void).init(a);
    defer known.deinit();
    for (options.character) |id| try known.put(id, {});
    for (table.cells) |*cell| {
        _ = try cell.validate(table.resources.character);
        var scratch: [1]@import("../model/document.zig").CharacterRun = undefined;
        for (cell.runs(table.resources.character, &scratch)) |run| if (!known.contains(run.char_shape_id)) return error.InvalidCharacterShapeReference;
    }
}
