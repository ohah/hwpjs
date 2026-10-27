//! 기존 문단 resource transaction과 checkpoint를 재사용합니다.
const std = @import("std");
const Patch = @import("../model/border_fill_patch.zig").Patch;
pub fn apply(session: *@import("editor_session.zig").Session, section: usize, paragraph: usize, patch: Patch, flags: @import("../model/paragraph_flags.zig").Patch) !bool {
    return @import("paragraph_alignment_session.zig").applyWithResources(session, section, paragraph, null, .{}, null, flags, patch);
}
pub fn observe(a: std.mem.Allocator, session: *@import("editor_session.zig").Session, kind: []const u8, identity: u32, field: []const u8) !@import("../model/border_fill_patch.zig").Value {
    return read(a, session, kind, identity, @splat(std.mem.endsWith(u8, field, ".border")), std.mem.endsWith(u8, field, ".background"));
}
fn read(a: std.mem.Allocator, session: *@import("editor_session.zig").Session, kind: []const u8, identity: u32, mask: [4]bool, background: bool) !@import("../model/border_fill_patch.zig").Value {
    var context = try @import("formatting_preflight.zig").Context.init(a, session);
    defer context.deinit();
    return readContext(a, session, &context, kind, identity, mask, background);
}
/// 요청 소유 context를 빌린다. 반환값은 숫자·enum·고정 배열만 소유하며 tree slice를 보관하지 않는다.
pub fn observeWithContext(a: std.mem.Allocator, session: *@import("editor_session.zig").Session, context: *@import("formatting_preflight.zig").Context, kind: []const u8, identity: u32, field: []const u8) !@import("../model/border_fill_patch.zig").Value {
    return readContext(a, session, context, kind, identity, @splat(std.mem.endsWith(u8, field, ".border")), std.mem.endsWith(u8, field, ".background"));
}
fn readContext(a: std.mem.Allocator, session: *@import("editor_session.zig").Session, context: *@import("formatting_preflight.zig").Context, kind: []const u8, identity: u32, mask: [4]bool, background: bool) !@import("../model/border_fill_patch.zig").Value {
    const node = try @import("border_fill_resource_patch.zig").target(a, &context.tree, kind, identity);
    const ref = try @import("border_fill_resource_patch.zig").reference(a, &context.tree, node);
    const source = try @import("border_fill_resource_patch.zig").sourceNode(a, &context.tree, ref);
    if (background and context.profile == null) context.profile = try @import("border_fill_profile.zig").read(a, session.source);
    return @import("border_fill_xml_patch.zig").observeSelected(a, &context.tree, source, if (background) context.profile.? else .{}, mask, background);
}
pub fn matchesCharacterCurrent(session: *@import("editor_session.zig").Session, id: u32, patch: Patch) !bool {
    if (!@import("../model/border_fill_patch.zig").has(patch)) return true;
    return matchesKind(session, "charPr", id, patch);
}
pub fn matchesCurrent(session: *@import("editor_session.zig").Session, id: u32, patch: Patch) !bool {
    return matchesKind(session, "paraPr", id, patch);
}
fn matchesKind(session: *@import("editor_session.zig").Session, kind: []const u8, id: u32, patch: Patch) !bool {
    var mask: [4]bool = @splat(false);
    for (patch.border.edges, 0..) |edge, i| if (edge) |value| {
        mask[i] = @import("../model/border_fill_patch.zig").edgeHas(value);
    };
    return @import("../model/border_fill_patch.zig").matches(try read(session.allocator, session, kind, id, mask, patch.background != null), patch);
}
