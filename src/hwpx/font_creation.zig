//! Owned font creation and current read projection; no retained header cache.
const std = @import("std");
const editor = @import("editor_session.zig");
const Value = @import("../model/font_face_value.zig").Value;

pub fn list(session: *const editor.Session) ![]Value {
    const a = session.allocator;
    const header = try @import("header_resource_save.zig").replacementWithFonts(a, session.source, &session.paragraph_resources, &session.character_resources, &session.font_resources, session.options.max_xml_bytes);
    defer a.free(header.bytes);
    var tree = try @import("header_tree.zig").parse(a, header.bytes, 0, .{ .max_xml_bytes = session.options.max_xml_bytes });
    defer tree.deinit(a);
    return @import("font_face_snapshot.zig").collect(a, &tree, 1_000_000, 4096);
}

pub fn ensure(session: *editor.Session, language: @import("font_faces.zig").Language, name: []const u8) !u32 {
    const a = session.allocator;
    try @import("../model/font_name.zig").validate(name, 4096);
    const current = try list(session);
    defer @import("font_face_snapshot.zig").deinit(a, current);
    for (current) |face| if (face.language == language) {
        if (face.name) |existing| if (std.mem.eql(u8, existing, name)) return face.id;
    };
    var id: u32 = 0;
    for (current) |face| if (face.language == language) {
        id = @max(id, std.math.add(u32, face.id, 1) catch return error.InvalidFontId);
    };
    var pending = try session.font_resources.clone(a);
    defer pending.deinit(a);
    _ = try pending.add(a, language, id, name, 4096);
    const verified = try @import("header_resource_save.zig").replacementWithFonts(a, session.source, &session.paragraph_resources, &session.character_resources, &pending, session.options.max_xml_bytes);
    defer a.free(verified.bytes);
    std.mem.swap(@import("../model/font_resource_values.zig").Values, &session.font_resources, &pending);
    return id;
}

pub fn apply(session: *editor.Session, section: usize, paragraph: usize, start: u32, end: u32, language: @import("font_faces.zig").Language, name: []const u8) !bool {
    try @import("../model/font_name.zig").validate(name, 4096);
    _ = try session.setCharacterProperties(section, paragraph, start, end, .{});
    if (start == end) return false;
    var checkpoint = try @import("editor_checkpoint.zig").capture(session, std.math.maxInt(usize));
    defer checkpoint.deinit();
    errdefer checkpoint.rollback(session) catch unreachable;
    const count = session.font_resources.entries.items.len;
    const id = try ensure(session, language, name);
    var ids: @import("../model/character_fonts.zig").Values = @splat(null);
    ids[@intFromEnum(language)] = id;
    const changed = try session.setCharacterProperties(section, paragraph, start, end, .{ .font_ids = ids });
    return changed or session.font_resources.entries.items.len != count;
}
