//! Resolve created-table references without treating sparse IDs as indices.
const std = @import("std");
pub fn validate(session: *const @import("editor_session.zig").Session, resources: @import("../model/created_table.zig").Resources) !void {
    const a = session.allocator;
    var document = try @import("package.zig").inspectDocument(a, session.source, .{});
    defer document.deinit(a);
    var report = try document.inspectHeaderResources(a, .{ .resources = .{ .max_xml_bytes = session.options.max_xml_bytes } });
    defer report.deinit(a);
    var paragraph = report.table(.para_shape).hasId(resources.paragraph);
    var character = report.table(.char_shape).hasId(resources.character);
    for (session.paragraph_resources.entries.items) |entry| if (entry.id == resources.paragraph) {
        paragraph = true;
    };
    for (session.character_resources.entries.items) |entry| if (entry.id == resources.character) {
        character = true;
    };
    if (!paragraph) return error.InvalidParagraphShapeReference;
    if (!character) return error.InvalidCharacterShapeReference;
    if (!report.table(.style).hasId(resources.style)) return error.InvalidStyleReference;
    if (!report.table(.border_fill).hasId(resources.border_fill)) return error.InvalidBorderFillReference;
}
