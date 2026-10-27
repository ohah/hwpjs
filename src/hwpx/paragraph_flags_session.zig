//! 기존 alignment resource transaction과 checkpoint 소유자를 재사용합니다.
const std = @import("std");
pub fn apply(session: *@import("editor_session.zig").Session, section: usize, paragraph: usize, flags: @import("../model/paragraph_flags.zig").Patch) !bool {
    return @import("paragraph_alignment_session.zig").applyWithFlags(session, section, paragraph, null, .{}, null, flags);
}
pub fn matchesCurrent(session: *@import("editor_session.zig").Session, id: u32, flags: @import("../model/paragraph_flags.zig").Patch) !bool {
    const a = session.allocator;
    var context = try @import("formatting_preflight.zig").Context.init(a, session);
    defer context.deinit();
    const node = try @import("formatting_preflight.zig").node(a, &context.tree, "paraPr", id);
    const value = try @import("paragraph_flags_patch.zig").read(a, &context.tree, node);
    return @import("../model/paragraph_flags.zig").matches(value, flags);
}
