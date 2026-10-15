//! Current dutmal locations reuse the shared protected-anchor projection.
const std = @import("std");
const editor = @import("editor_session.zig");
pub const Site = struct { node: usize, paragraph: usize, anchor_unit: usize };

pub fn text(session: *const editor.Session, section: usize, node: usize) ![]u8 {
    const a = session.allocator;
    const sites = try read(a, session, section);
    defer a.free(sites);
    const paragraph = found: {
        for (sites) |site| if (site.node == node) break :found site.paragraph;
        return error.InvalidDutmalNode;
    };
    return session.anchorText(section, paragraph) catch |err| switch (err) {
        error.UnsupportedStructuralFieldEdit => @import("field_label_display_text.zig").read(session, section, paragraph),
        else => return err,
    };
}

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section: usize) ![]Site {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const part = &session.sections[section];
    const options = editor.siteOptions(session.options);
    const selection = try @import("xml_tree_selection.zig").build(a, &part.tree, options.branch_policy, options.max_attribute_bytes);
    defer a.free(selection);
    var current = try @import("display_current_paragraphs.zig").read(a, part, session.options);
    defer current.deinit(a);
    var result: std.ArrayList(Site) = .empty;
    defer result.deinit(a);
    for (part.tree.elements, 0..) |element, node| {
        if (!selection[node].active) continue;
        if (@import("run_anchor.zig").kind(&part.tree, node) != .dutmal) continue;
        const run = element.parent orelse return error.InvalidPartTree;
        const template = part.tree.elements[run].parent orelse return error.InvalidPartTree;
        const host = @import("protected_display_host.zig");
        const paragraph = try host.currentAnchorOrdinal(current.paragraphs, part.first_paragraph, template, node);
        const unit = try host.anchorPosition(a, &part.tree, &current.paragraphs[paragraph - part.first_paragraph], node);
        try result.append(a, .{ .node = node, .paragraph = paragraph, .anchor_unit = unit });
    }
    return result.toOwnedSlice(a);
}

test "dutmal display sites follow field input without moving source identity" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpx/opengov/36389301_결재문서본문_직장훈련계획_덧말.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const before = try read(a, &session, 0);
    defer a.free(before);
    try std.testing.expectEqual(@as(usize, 1), before.len);
    try std.testing.expectEqual(@as(usize, 26), before[0].paragraph);
    try std.testing.expectEqual(@as(usize, 43), before[0].anchor_unit);
    const initial_text = try text(&session, 0, before[0].node);
    defer a.free(initial_text);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, initial_text, "\xef\xbf\xbc"));
    const fields = try session.fieldLabels(0, 26);
    defer a.free(fields);
    try std.testing.expect(try session.spliceFieldLabel(0, 26, fields[0].begin_element, 0, 0, "앞😀"));
    const after = try read(a, &session, 0);
    defer a.free(after);
    try std.testing.expectEqual(before[0].node, after[0].node);
    try std.testing.expectEqual(@as(usize, 46), after[0].anchor_unit);
    try std.testing.expectEqual(before[0].paragraph, after[0].paragraph);
    const moved_text = try text(&session, 0, before[0].node);
    defer a.free(moved_text);
    try std.testing.expect(std.mem.startsWith(u8, moved_text, "앞😀"));
    try std.testing.expect(try session.setDutmalText(0, after[0].node, .main_text, "새 본문"));
    const changed = try read(a, &session, 0);
    defer a.free(changed);
    try std.testing.expectEqualDeep(after, changed);
}
