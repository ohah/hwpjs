//! Exact-coordinate splice of the canonical generated-cell paragraph. Native
//! global resources and the existing owned History are the only mutable owners.
const std = @import("std");
const editor = @import("editor_session.zig");
const Edit = @import("../model/created_cell_typing.zig").Edit;

pub fn apply(session: *editor.Session, edit: Edit) !bool {
    try @import("../model/created_cell_typing.zig").validate(edit);
    if (!session.history_transaction_active) return error.HistoryProtocolRequired;
    _ = session.formatting_batch orelse return error.FormattingBatchNotPrepared;
    if (edit.section >= session.sections.len) return error.InvalidSectionIndex;
    const a = session.allocator;
    const values = &session.sections[edit.section].created_tables;
    var found: ?usize = null;
    for (values.entries.items, 0..) |entry, index| if (entry.table.identity == edit.identity) {
        if (found != null) return error.InvalidCreatedTableIdentity;
        found = index;
    };
    const index = found orelse return error.InvalidCreatedTableIdentity;
    const original = &values.entries.items[index].table;
    _ = try original.plan.cell(edit.row, edit.column);
    const cell = @as(usize, edit.row) * original.plan.columns + edit.column;
    if (cell >= original.cells.len) return error.InvalidTableCell;
    const source_id = try original.cells[cell].typingResourceId(original.resources.character, edit.start, edit.end, .preceding_visible);
    var candidate = try values.clone(a);
    defer candidate.deinit(a);
    var inserted_id: ?u32 = null;
    if (edit.text.len != 0) {
        var properties = @import("../model/formatting_patch.zig").CharacterIntent.init(edit.insertion).properties orelse @import("../model/document.zig").CharacterPropertyPatch{};
        var ids = properties.font_ids orelse @as(@import("../model/character_fonts.zig").Values, @splat(null));
        var has_ids = properties.font_ids != null;
        for (edit.insertion.fonts, 0..) |font, language| if (font) |value| switch (value) {
            .id => {},
            .name => |name| {
                ids[language] = try @import("font_creation.zig").ensure(session, @fromBackingInt(@intCast(language)), name);
                has_ids = true;
            },
        };
        if (has_ids) properties.font_ids = ids;
        inserted_id = try @import("character_property_session.zig").resolveInsertedResource(session, source_id, properties);
    }
    const table = &candidate.entries.items[index].table;
    if (!try table.cells[cell].splice(a, table.resources.character, edit.start, edit.end, edit.text, inserted_id, session.options.max_text_bytes)) return false;
    _ = try candidate.byteSize(session.options.max_xml_bytes);
    try @import("created_table_resources.zig").validateTable(session, table);
    std.mem.swap(@import("created_table_values.zig").Values, values, &candidate);
    var committed = false;
    defer if (!committed) std.mem.swap(@import("created_table_values.zig").Values, values, &candidate);
    const saved = try session.save();
    a.free(saved);
    committed = true;
    return true;
}
