//! Borrowed one-command payload. Native resources and canonical paragraph own
//! every committed value; no wire string or patch outlives its History call.
pub const Edit = struct {
    section: usize,
    identity: u64,
    row: u32,
    column: u32,
    start: u32,
    end: u32,
    text: []const u8,
    insertion: @import("formatting_patch.zig").Patch = .{},
};
pub fn validate(edit: Edit) !void {
    if (edit.identity == 0) return error.InvalidCreatedTableIdentity;
    if (edit.start > edit.end) return error.InvalidTextPosition;
    if (edit.text.len == 0 and edit.insertion.hasCharacter()) return error.UnsupportedTextInsertionFormatting;
    if (edit.insertion.reset != null or edit.insertion.hasParagraph()) return error.UnsupportedTextInsertionFormatting;
    try @import("character_properties.zig").validate(edit.insertion.character);
    for (edit.insertion.fonts) |font| if (font) |value| switch (value) {
        .id => {},
        .name => |name| try @import("font_name.zig").validate(name, @import("formatting_patch.zig").limits.font_name_bytes),
    };
}
