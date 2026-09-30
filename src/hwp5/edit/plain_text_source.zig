//! Source eligibility and metadata validation, separate from mutable splicing.
const std = @import("std");
const model = @import("../../model/document.zig");
const body = @import("../body/reader.zig");
const Tree = @import("../body/tree.zig").Tree;
const children = @import("../body/paragraph_children.zig");
const Version = @import("../version.zig").Version;
const framing = @import("../record.zig");
const controls = @import("../body/control_rules.zig");

/// Known framing alone does not make an opaque control safe to relocate around.
pub fn validateSection(source: []const u8) !void {
    var it = framing.Iterator.init(source, .{});
    while (try it.next()) |entry| {
        const tag = std.enums.fromInt(body.Tag, entry.tag) orelse return error.UnsupportedSectionRecord;
        switch (tag) {
            .control_header => {
                const header = try body.ControlHeader.parse(entry.payload);
                if (header.id != controls.section_id and header.id != controls.column_id)
                    return error.UnsupportedSectionControl;
            },
            .list_header, .table, .memo_list => return error.UnsupportedSectionStructure,
            else => {},
        }
    }
}

/// Returned ranges borrow source, not the temporary Tree nodes.
pub fn validate(a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, char_count: usize) !?body.Ranges {
    if (p.parent_node != null) return error.UnsupportedNestedParagraph;
    var tree = try Tree.parseTextPreview(a, source, version, .{});
    defer tree.deinit(a);
    const node = tree.nodes[p.source_node];
    const h = node.record.value.header;
    if (h.extra.len != 0 or (h.merge_tracking orelse 0) != 0) return error.UnsupportedParagraphExtension;
    if (h.control_mask & ~@as(u32, 1 << 13) != 0) return error.UnsupportedTextControl;
    try validateSection(source);
    var runs: ?body.Runs = null;
    var ranges: ?body.Ranges = null;
    var lines: ?body.Segments = null;
    var child = @as(usize, p.source_node) + 1;
    while (child < node.subtree_end) : (child += 1) {
        const entry = tree.nodes[child];
        if (entry.parent != p.source_node or entry.subtree_end != child + 1) return error.UnsupportedParagraphRecord;
        switch (entry.record.framing.tag) {
            @intFromEnum(body.Tag.paragraph_text) => {},
            @intFromEnum(body.Tag.char_runs) => {
                if (runs != null) return error.DuplicateParagraphRecord;
                runs = try body.Runs.parse(entry.record.framing.payload);
            },
            @intFromEnum(body.Tag.range_tags) => {
                if (ranges != null) return error.DuplicateParagraphRecord;
                ranges = try body.Ranges.parse(entry.record.framing.payload);
            },
            @intFromEnum(body.Tag.line_segments) => {
                if (lines != null) return error.DuplicateParagraphRecord;
                lines = try body.Segments.parse(entry.record.framing.payload);
            },
            else => return error.UnsupportedParagraphRecord,
        }
    }
    try (body.Metadata{ .runs = runs, .ranges = ranges, .lines = lines }).validate(h, char_count);
    const parts = try children.collect(tree, p.source_node);
    const text_node = parts.text_node orelse return error.UnsupportedMissingText;
    try tree.nodes[text_node].record.value.text.validateCount(h);
    return ranges;
}
