//! Owned font creation and current read projection through a scoped header lease.
const std = @import("std");
const editor = @import("editor_session.zig");
const Value = @import("../model/font_face_value.zig").Value;

pub fn list(session: *const editor.Session) ![]Value {
    return listRows(session, false);
}
pub fn metadata(session: *const editor.Session) ![]@import("font_face_metadata.zig").Value {
    return listRows(session, true);
}
fn listRows(session: *const editor.Session, comptime include_metadata: bool) ![]if (include_metadata) @import("font_face_metadata.zig").Value else Value {
    const a = session.allocator;
    var lease = try @import("header_read_context.zig").lease(session);
    defer lease.deinit();
    const ctx = lease.get();
    const tree = try ctx.currentHeader(true);
    const snapshot = @import("font_face_snapshot.zig");
    return if (include_metadata) snapshot.collectMetadata(a, tree, 1_000_000, 4096) else snapshot.collect(a, tree, 1_000_000, 4096);
}

pub fn ensure(session: *editor.Session, language: @import("font_faces.zig").Language, name: []const u8) !u32 {
    const a = session.allocator;
    try @import("../model/font_name.zig").validate(name, 4096);
    const current = try list(session);
    defer @import("font_face_snapshot.zig").deinit(a, current);
    for (current) |face| if (face.language == language) {
        if (face.name) |existing| if (std.mem.eql(u8, existing, name)) return face.id;
    };
    // This helper also serves direct Zig callers outside the central ABI guard.
    // Reusing an existing face is read-only; adding one must end the borrow first.
    if (session.header_read_context) |context| {
        if (context.owner == session) return error.ReadObservationScopeActive;
    }
    var id: u32 = 0;
    for (current) |face| if (face.language == language) {
        id = @max(id, std.math.add(u32, face.id, 1) catch return error.InvalidFontId);
    };
    var pending = try session.font_resources.clone(a);
    defer pending.deinit(a);
    _ = try pending.add(a, language, id, name, 4096);
    const verified = if (session.formatting_batch) |context| try @import("header_resource_save.zig").replacementBatch(a, session.source, &session.paragraph_resources, &session.character_resources, &pending, session.options.max_xml_bytes, &context.header_stats) else try @import("header_resource_save.zig").replacementWithFonts(a, session.source, &session.paragraph_resources, &session.character_resources, &pending, session.options.max_xml_bytes);
    defer a.free(verified.bytes);
    std.mem.swap(@import("../model/font_resource_values.zig").Values, &session.font_resources, &pending);
    return id;
}

pub fn apply(session: *editor.Session, section: usize, paragraph: usize, start: u32, end: u32, language: @import("font_faces.zig").Language, name: []const u8) !bool {
    return applyScoped(session, section, paragraph, start, end, language, name, null);
}
pub fn applyScoped(session: *editor.Session, section: usize, paragraph: usize, start: u32, end: u32, language: @import("font_faces.zig").Language, name: []const u8, cache: ?*@import("../model/batch_font_lookup.zig").Cache) !bool {
    errdefer if (cache) |known| known.clear();
    errdefer if (session.formatting_batch) |context| context.invalidateSections();
    try @import("../model/font_name.zig").validate(name, 4096);
    _ = try session.setCharacterProperties(section, paragraph, start, end, .{});
    if (start == end) return false;
    var checkpoint: ?@import("editor_checkpoint.zig").Checkpoint = if (session.formatting_batch == null) try @import("editor_checkpoint.zig").capture(session, std.math.maxInt(usize)) else null;
    defer if (checkpoint) |*value| value.deinit();
    errdefer if (checkpoint) |*value| value.rollback(session) catch unreachable;
    const count = session.font_resources.entries.items.len;
    const cached = if (cache) |known| known.get(@backingInt(language), name) else null;
    const id = cached orelse try ensure(session, language, name);
    if (cache) |known| known.put(@backingInt(language), name, id);
    var ids: @import("../model/character_fonts.zig").Values = @splat(null);
    ids[@backingInt(language)] = id;
    const changed = try session.setCharacterProperties(section, paragraph, start, end, .{ .font_ids = ids });
    return changed or session.font_resources.entries.items.len != count;
}
