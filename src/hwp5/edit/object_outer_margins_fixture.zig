//! Own test-only active wrapping fixture. Not a product writer or hidden runtime fallback.
const std = @import("std");
const margins = @import("object_outer_margins.zig");
const Session = @import("style_preservation.zig").Session;
pub const body_text = "NativeMarginBody 0123456789 around the floating object. NativeMarginBody 0123456789 around the floating object. NativeMarginBody 0123456789 around the floating object. NativeMarginBody 0123456789 around the floating object. NativeMarginBody 0123456789 around the floating object. NativeMarginBody 0123456789 around the floating object.";
pub fn prepare(a: std.mem.Allocator, original: []const u8, kind: margins.Kind, ordinal: u3) ![]u8 {
    var source = try @import("../text_source.zig").Source.open(a, original);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var tree = try @import("source_tree.zig").parse(a, raw, source.header.version(), .{});
    defer tree.deinit(a);
    const sources = try @import("drawing_sources.zig").read(a, raw, source.header.version());
    defer a.free(sources);
    var selected: ?@import("drawing_sources.zig").Source = null;
    for (sources) |item| if (item.kind_id == (if (kind == .picture) @import("../body/control_rules.zig").id("$pic") else @import("../body/control_rules.zig").id("$rec"))) {
        if (selected != null) return error.AmbiguousOuterMarginFixture;
        selected = item;
    };
    const item = selected orelse return error.MissingOuterMarginFixtureTarget;
    if (tree.nodes[item.component_node].parent != item.control_node) return error.InvalidOuterMarginFixtureHost;
    const lists = try @import("drawing_list_sources.zig").read(a, raw, source.header.version());
    defer a.free(lists);
    const excluded = try a.alloc(bool, tree.nodes.len);
    defer a.free(excluded);
    @memset(excluded, false);
    var groups = try @import("../body/list_groups.zig").Groups.build(a, tree);
    defer groups.deinit(a);
    for (lists) |list| if (list.control_node == item.control_node and list.kind == .caption) {
        var matched = false;
        for (groups.items) |group| if (group.header_node == list.list_node and group.parent_node == item.control_node) {
            if (matched) return error.AmbiguousOuterMarginFixtureCaption;
            matched = true;
            @memset(excluded[list.list_node..tree.nodes[list.list_node].subtree_end], true);
            // A list's logical paragraphs are siblings of LIST_HEADER. The group
            // may also contain a shape component; that entire subtree stays intact.
            var child = group.begin;
            var paragraph_count: usize = 0;
            while (child < group.end) {
                const node = tree.nodes[child];
                if (node.record.value == .header) {
                    if (node.parent != group.parent_node) return error.InvalidOuterMarginFixtureCaption;
                    @memset(excluded[child..node.subtree_end], true);
                    paragraph_count += 1;
                }
                child = node.subtree_end;
            }
            if (paragraph_count != group.paragraph_count) return error.InvalidOuterMarginFixtureCaption;
        };
        if (!matched) return error.InvalidOuterMarginFixtureCaption;
    };
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(a);
    for (tree.nodes, 0..) |node, index| {
        if (excluded[index]) continue;
        const framing = node.record.framing;
        const begin = bytes.items.len;
        try bytes.appendSlice(a, framing.raw);
        if (index == item.control_node) {
            const payload = begin + framing.raw.len - framing.payload.len;
            // Explicit own paragraph-relative position, common dimensions untouched.
            // raw0 is Square in both the table and current compact display policy.
            const flags: u32 = (4 << 15) | (2 << 18) | (2 << 3) | (3 << 8) | (@as(u32, ordinal) << 21);
            std.mem.writeInt(u32, bytes.items[payload + 4 ..][0..4], flags, .little);
            std.mem.writeInt(i32, bytes.items[payload + 8 ..][0..4], 0, .little);
            std.mem.writeInt(i32, bytes.items[payload + 12 ..][0..4], 7200, .little);
        }
    }
    const encoded = if (source.header.has(.compressed)) try @import("../../compression/raw_deflate.zig").encodeStored(a, bytes.items, 32 * 1024 * 1024) else try a.dupe(u8, bytes.items);
    defer a.free(encoded);
    const container = try @import("../../cfb/stream_replace.zig").rebuildExact(a, &source.file, "/BodyText/Section0", encoded, .{ .max_output_bytes = 64 * 1024 * 1024 });
    defer a.free(container);
    const session = try Session.open(a, container);
    defer session.close();
    const anchors = try session.drawingAnchors(a, 0);
    defer a.free(anchors);
    if (anchors.len != 1) return error.InvalidOuterMarginFixtureHost;
    try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = anchors[0].paragraph, .start_unit = 0, .end_unit = 0, .utf8 = body_text } });
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    errdefer a.free(saved.bytes);
    const checked = try Session.open(a, saved.bytes);
    defer checked.close();
    const checked_lists = try checked.drawingListSources(a, 0);
    defer a.free(checked_lists);
    for (checked_lists) |list| if (list.kind == .caption) return error.InvalidOuterMarginFixtureCaption;
    return saved.bytes;
}
