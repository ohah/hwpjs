//! Read-only projection bytes keep existing paragraph addresses stable.
//! Created tables are supplied separately by the current owned snapshot API.
const std = @import("std");
pub fn save(session: *const @import("editor_session.zig").Session) ![]u8 {
    const a = session.allocator;
    const sections = try a.dupe(@import("editor_session.zig").Section, session.sections);
    defer a.free(sections);
    for (sections) |*section| section.created_tables = .{};
    var borrowed = session.*;
    borrowed.sections = sections;
    return borrowed.save();
}
