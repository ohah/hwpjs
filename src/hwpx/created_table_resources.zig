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
