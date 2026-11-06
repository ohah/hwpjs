//! Narrow first-root section/column prefix split. Source subtrees stay left;
//! generated continuations contain plain text only and retain the source template.
const std = @import("std");
const model = @import("../../model/document.zig");
const Tree = @import("../body/tree.zig").Tree;
const Version = @import("../version.zig").Version;
const controls = @import("../body/control_rules.zig");
const Header = @import("../body/control_header.zig").Header;
const Draft = @import("paragraph_split.zig").Draft;

pub fn hasSection(tree: Tree, source: usize) bool {
    if (source >= tree.nodes.len) return false;
    var index = source + 1;
    while (index < tree.nodes[source].subtree_end) {
        const node = tree.nodes[index];
        if (node.parent == source and node.record.framing.tag == 71) {
            const header = Header.parse(node.record.framing.payload) catch return false;
            if (header.id == controls.section_id) return true;
        }
        index = node.subtree_end;
    }
    return false;
}

/// Also used by generated-continuation source validation. This grants only a
/// known immutable template, never permission to emit its children a second time.
pub fn validateTemplate(tree: Tree, source: usize) !void {
    if (source != 0 or tree.nodes.len == 0 or tree.nodes[0].record.value != .header or tree.nodes[0].parent != null) return error.UnsupportedStructuralControl;
    const version = tree.version orelse return error.SourceBindingMismatch;
    var sections: usize = 0;
    var columns: usize = 0;
    var index: usize = 1;
    while (index < tree.nodes[0].subtree_end) {
        const node = tree.nodes[index];
        if (node.parent != 0) return error.UnsupportedStructuralControl;
        switch (node.record.framing.tag) {
            67, 68, 69, 70 => if (node.subtree_end != index + 1) return error.UnsupportedStructuralControl,
            71 => {
                const header = try Header.parse(node.record.framing.payload);
                if (header.id == controls.section_id) {
                    if (sections != 0 or columns != 0) return error.UnsupportedStructuralControl;
                    const section = try @import("../body/section_def.zig").Definition.parse(header.properties, version);
                    if (section.extra.len != 0) return error.UnsupportedStructuralControl;
                    var pages: usize = 0;
                    var notes: usize = 0;
                    var borders: usize = 0;
                    var child = index + 1;
                    while (child < node.subtree_end) : (child += 1) {
                        const record = tree.nodes[child];
                        if (record.parent != index or record.subtree_end != child + 1) return error.UnsupportedStructuralControl;
                        const payload = record.record.framing.payload;
                        switch (record.record.framing.tag) {
                            73 => {
                                const page = try @import("../body/page_def.zig").Definition.parse(payload);
                                if (page.extra.len != 0) return error.UnsupportedStructuralControl;
                                pages += 1;
                            },
                            74 => {
                                const note = try @import("../body/note_shape.zig").Shape.parse(payload);
                                if (note.extra.len != 0) return error.UnsupportedStructuralControl;
                                notes += 1;
                            },
                            75 => {
                                const border = try @import("../body/page_border.zig").Border.parse(payload);
                                if (border.extra.len != 0) return error.UnsupportedStructuralControl;
                                borders += 1;
                            },
                            else => return error.UnsupportedStructuralControl,
                        }
                    }
                    if (pages != 1 or notes > 2 or borders > 3) return error.UnsupportedStructuralControl;
                    sections += 1;
                } else if (header.id == controls.column_id) {
                    if (sections != 1 or columns != 0 or node.subtree_end != index + 1) return error.UnsupportedStructuralControl;
                    const column = try @import("../body/column_def.zig").Definition.parse(header.properties);
                    if (column.extra.len != 0) return error.UnsupportedStructuralControl;
                    columns += 1;
                } else return error.UnsupportedStructuralControl;
            },
            else => return error.UnsupportedStructuralControl,
        }
        index = node.subtree_end;
    }
    if (sections != 1 or columns != 1) return error.UnsupportedStructuralControl;
}

pub fn prepare(a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, at: u32, new_id: u32, char_count: usize) !Draft {
    if (new_id == 0 or new_id == p.instance_id) return error.InvalidParagraphInstanceId;
    if (p.field_attributes != null or p.formula_results != null) return error.UnsupportedStructuralControl;
    if (p.range_tags) |ranges| if (ranges.len != 0) return error.UnsupportedRangeSemantics;
    _ = try @import("plain_text_source.zig").validate(a, source, version, p, char_count);
    var tree = try Tree.parseTextPreview(a, source, version, .{});
    defer tree.deinit(a);
    try validateTemplate(tree, try p.originalNode());
    var anchors: usize = 0;
    for (p.tokens) |token| {
        if (token.kind != .control) continue;
        if (token.raw.len == 2 and (std.mem.readInt(u16, token.raw[0..2], .little) == 10 or std.mem.readInt(u16, token.raw[0..2], .little) == 13)) continue;
        if (anchors >= 2 or token.raw.len != 16 or token.start_unit != anchors * 8 or
            std.mem.readInt(u16, token.raw[0..2], .little) != 2 or
            std.mem.readInt(u32, token.raw[2..6], .little) != (if (anchors == 0) controls.section_id else controls.column_id) or
            !std.mem.allEqual(u8, token.raw[6..14], 0) or std.mem.readInt(u16, token.raw[14..16], .little) != 2)
            return error.UnsupportedStructuralControl;
        anchors += 1;
    }
    if (anchors != 2) return error.SourceBindingMismatch;
    if (at < 16) return error.UnsupportedSectionAnchorRelocation;
    const bytes = try @import("plain_text_content.zig").editableTextBytes(a, p);
    defer a.free(bytes);
    try @import("control_boundaries.zig").validate(bytes, at, at);
    try @import("character_runs.zig").validate(p.character_runs, bytes, char_count);
    const end: u32 = @intCast(bytes.len / 2 - 1);
    const left_bytes = try a.alloc(u8, @as(usize, at) * 2 + 2);
    defer a.free(left_bytes);
    @memcpy(left_bytes[0 .. left_bytes.len - 2], bytes[0 .. @as(usize, at) * 2]);
    left_bytes[left_bytes.len - 2 ..][0..2].* = .{ 13, 0 };
    const right_bytes = bytes[@as(usize, at) * 2 ..];
    try @import("plain_text_content.zig").validatePlain(right_bytes);
    var left = try @import("../../model/clone.zig").paragraph(a, p);
    errdefer left.deinit(a);
    var right = try @import("../../model/clone.zig").paragraph(a, p);
    errdefer right.deinit(a);
    try @import("split_text_projection.zig").replace(a, &left, left_bytes, at, end);
    try @import("split_text_projection.zig").replace(a, &right, right_bytes, 0, at);
    right.source_node = null;
    right.header_template = p.source_node;
    right.instance_id = new_id;
    right.deferred_direct_records = 0;
    return .{ .left = left, .right = right };
}
