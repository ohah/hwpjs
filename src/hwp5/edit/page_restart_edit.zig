//! Existing PAGE restart only. This draft does not publish Session state or grant a lease.
const std = @import("std");
const Version = @import("../version.zig").Version;
const rules = @import("../body/control_rules.zig");
pub const Target = struct {
    section: usize,
    control_node: usize,
    paragraph_node: usize,
    source_unit: usize,
    number: u16,
    section_digest: [32]u8,
};
pub const Anchor = struct { paragraph: usize, current_unit: u32 };
pub const Request = @import("../../model/page_restart_edit.zig").Request(Target);
fn sameNode(node: ?u32, expected: usize) bool {
    return if (node) |value| @as(usize, value) == expected else false;
}

pub fn capture(a: std.mem.Allocator, raw: []const u8, version: Version, section: usize, control_node: usize) !Target {
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    var links = try @import("../body/control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    var selected: ?usize = null;
    for (links.items, 0..) |link, i| if (link.control_node == control_node) {
        if (selected != null) return error.AmbiguousPageRestart;
        selected = i;
    };
    const index = selected orelse return error.MissingPageRestart;
    const link = links.items[index];
    if (link.header_id != rules.id("nwno") or tree.nodes[link.paragraph_node].parent != null)
        return error.UnsupportedPageRestartOwner;
    // Existing policy proves exact code21/id identity, one control in the owner,
    // PAGE attributes=0, no opaque tail/children, and an immutable16-byte anchor.
    _ = try @import("page_restart_source.zig").token(tree, links.items, index);
    const value = try @import("../body/number_control.zig").Restart.parse(tree.nodes[control_node].record.value.control_header.properties);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(raw, &digest, .{});
    return .{ .section = section, .control_node = control_node, .paragraph_node = link.paragraph_node, .source_unit = link.start_unit, .number = value.header.number, .section_digest = digest };
}

/// Actual current token position, not a guessed page or a source-node-as-paragraph cast.
/// Continuations and generated owners are deliberately not admitted by this first draft.
pub fn currentAnchor(a: std.mem.Allocator, raw: []const u8, version: Version, paragraphs: []const @import("../../model/document.zig").Paragraph, target: Target) !Anchor {
    if (!std.meta.eql(target, try capture(a, raw, version, target.section, target.control_node))) return error.StalePageRestartSnapshot;
    var selected: ?usize = null;
    for (paragraphs, 0..) |p, i| {
        if (sameNode(p.source_node, target.paragraph_node)) {
            if (p.header_template != null or p.restart_control_source != null or p.parent_node != null) return error.UnsupportedPageRestartOwner;
            if (selected != null) return error.AmbiguousPageRestartOwner;
            selected = i;
        } else if (sameNode(p.header_template, target.paragraph_node) or sameNode(p.restart_control_source, target.control_node)) return error.UnsupportedPageRestartOwner;
    }
    const paragraph = selected orelse return error.MissingPageRestartOwner;
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    var links = try @import("../body/control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    for (links.items, 0..) |link, index| if (link.control_node == target.control_node) {
        return .{ .paragraph = paragraph, .current_unit = try @import("current_control_anchor.zig").position(links.items, index, paragraphs[paragraph]) };
    };
    return error.MissingPageRestartOwner;
}

/// Owned candidate only; caller retains current state until History commits.
/// Layout records, text anchors, flags, tails and unrelated bytes are untouched.
pub fn write(a: std.mem.Allocator, raw: []const u8, version: Version, target: Target, number: u16) !?[]u8 {
    if (number == 0) return error.InvalidPageRestartNumber;
    const fresh = try capture(a, raw, version, target.section, target.control_node);
    if (!std.meta.eql(target, fresh)) return error.StalePageRestartSnapshot;
    if (number == target.number) return null;
    var it = @import("../record.zig").Iterator.init(raw, .{});
    var index: usize = 0;
    while (try it.next()) |record| : (index += 1) {
        if (index != target.control_node) continue;
        if (record.tag != 71 or record.payload.len != 10) return error.UnsupportedPageRestartOwner;
        const out = try a.dupe(u8, raw);
        const offset = record.offset + record.raw.len - record.payload.len + 8;
        std.mem.writeInt(u16, out[offset..][0..2], number, .little);
        return out;
    }
    return error.MissingPageRestart;
}
