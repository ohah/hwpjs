//! 현재 사각형 소유 문단과 보호 앵커입니다. 텍스트 유무와 독립적입니다.
const std = @import("std");
const editor = @import("editor_session.zig");
pub const Host = struct { paragraph: usize, anchor_unit: usize, anchor_node: usize };

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize, node: usize) !Host {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    const anchor = try anchorNode(&section.tree, node);
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    return resolve(a, section, current.paragraphs, anchor);
}

/// One owned current view per request, never retained across edits.
pub fn readMany(a: std.mem.Allocator, session: *const editor.Session, section_index: usize, nodes: []const usize) ![]Host {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    const result = try a.alloc(Host, nodes.len);
    errdefer a.free(result);
    if (nodes.len == 0) return result;
    // Preserve the first node's validation before building the current view.
    _ = try anchorNode(&section.tree, nodes[0]);
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    for (nodes, result) |node, *host| host.* = try resolve(a, section, current.paragraphs, try anchorNode(&section.tree, node));
    return result;
}

fn anchorNode(tree: *const @import("xml_part_tree.zig").Tree, node: usize) !usize {
    if (node >= tree.elements.len or !tree.elements[node].is(@import("document_xml.zig").paragraph_uri, "rect")) return error.UnsupportedDrawingTextAnchor;
    const group = try @import("grouped_shape_context.zig").read(tree, node);
    if (@import("run_anchor.zig").kind(tree, node) != .rectangle and group == null) return error.UnsupportedDrawingTextAnchor;
    return if (group) |context| context.root_anchor else node;
}

pub fn readCurrent(a: std.mem.Allocator, section: *const editor.Section, paragraphs: []const @import("paragraph_structure_values.zig").Paragraph, node: usize) !Host {
    return resolve(a, section, paragraphs, try anchorNode(&section.tree, node));
}

fn resolve(a: std.mem.Allocator, section: *const editor.Section, paragraphs: []const @import("paragraph_structure_values.zig").Paragraph, anchor: usize) !Host {
    const tree = &section.tree;
    const template = tree.elements[tree.elements[anchor].parent.?].parent.?;
    const ordinal = block: {
        for (paragraphs) |paragraph| {
            if (paragraph.protected_positions != null and try @import("paragraph_display_host.zig").matchesTemplate(&paragraph, template))
                break :block try @import("protected_display_host.zig").currentOrdinal(paragraphs, section.first_paragraph, template, anchor);
        }
        break :block try @import("paragraph_display_host.zig").currentOrdinal(paragraphs, section.first_paragraph, template);
    };
    return .{ .paragraph = ordinal, .anchor_node = anchor, .anchor_unit = try @import("protected_display_host.zig").anchorPosition(a, tree, &paragraphs[ordinal - section.first_paragraph], anchor) };
}

test "HWPX rectangle host batch shares current view without stale anchors" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapecontainer-2.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const nodes = [_]usize{ 94, 122, 94 };
    const Check = struct {
        fn run(allocator: std.mem.Allocator, state: *const editor.Session) !void {
            const hosts = try readMany(allocator, state, 0, &nodes);
            defer allocator.free(hosts);
            for (nodes, hosts) |node, host| try std.testing.expectEqualDeep(try read(allocator, state, 0, node), host);
        }
    };
    try Check.run(a, &session);
    try std.testing.checkAllAllocationFailures(a, Check.run, .{&session});
    _ = try session.spliceAnchored(0, 1, 0, 0, "앞😀");
    try Check.run(a, &session);
    const hosts = try readMany(a, &session, 0, &nodes);
    defer a.free(hosts);
    for (hosts) |host| try std.testing.expectEqual(@as(usize, 3), host.anchor_unit);
    try std.testing.expectError(error.UnsupportedDrawingTextAnchor, readMany(a, &session, 0, &.{ 94, 0 }));
    try std.testing.expectError(error.InvalidSectionIndex, readMany(a, &session, 999, &.{}));
    const empty = try readMany(a, &session, 0, &.{});
    defer a.free(empty);
    try std.testing.expectEqual(@as(usize, 0), empty.len);
}
