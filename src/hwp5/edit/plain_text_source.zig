//! Source eligibility and metadata validation, separate from mutable splicing.
const std = @import("std");
const model = @import("../../model/document.zig");
const body = @import("../body/reader.zig");
const Tree = @import("../body/tree.zig").Tree;
const children = @import("../body/paragraph_children.zig");
const Version = @import("../version.zig").Version;

pub const validateSection = @import("source_policy.zig").validate;
pub const Validation = struct { ranges: ?body.Ranges, preserved_direct_records: usize };

/// Returned ranges borrow source, not the temporary Tree nodes.
pub fn validate(a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, char_count: usize) !Validation {
    return validateWith(a, source, version, p, char_count, false, false);
}

pub fn validateFormulaTransaction(a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, char_count: usize) !Validation {
    return validateWith(a, source, version, p, char_count, true, false);
}

/// Only a section transaction with validated hyperlink spans may use this.
pub fn validateHyperlinkTransaction(a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, char_count: usize) !Validation {
    return validateWith(a, source, version, p, char_count, false, true);
}

fn validateWith(a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, char_count: usize, formulas: bool, cross_fields: bool) !Validation {
    var tree = try Tree.parseTextPreview(a, source, version, .{});
    defer tree.deinit(a);
    const node = tree.nodes[p.source_node];
    const h = node.record.value.header;
    if (h.extra.len != 0 or (h.merge_tracking orelse 0) != 0) return error.UnsupportedParagraphExtension;
    if (h.control_mask & ~@import("control_boundaries.zig").retained_mask != 0) return error.UnsupportedTextControl;
    if (formulas) {
        _ = try @import("source_policy.zig").hasFormulas(source);
    } else try validateSection(source);
    try @import("paragraph_owner.zig").validate(a, tree, p.source_node, version);
    var links_checked = false;
    var preserved_direct_records: usize = 0;
    var runs: ?body.Runs = null;
    var ranges: ?body.Ranges = null;
    var lines: ?body.Segments = null;
    var child = @as(usize, p.source_node) + 1;
    while (child < node.subtree_end) {
        const entry = tree.nodes[child];
        if (entry.parent != p.source_node) return error.UnsupportedParagraphRecord;
        if (entry.record.framing.tag == @intFromEnum(body.Tag.control_header)) {
            preserved_direct_records += 1;
            if (!links_checked) try @import("control_source.zig").validate(a, tree);
            links_checked = true;
            child = entry.subtree_end;
            continue;
        }
        if (entry.subtree_end != child + 1) return error.UnsupportedParagraphRecord;
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
        child = entry.subtree_end;
    }
    try (body.Metadata{ .runs = runs, .ranges = ranges, .lines = lines }).validate(h, char_count);
    const parts = try children.collect(tree, p.source_node);
    if (parts.text_node) |text_node| {
        const text = tree.nodes[text_node].record.value.text;
        try text.validateCount(h);
        if (formulas) try @import("../body/field_span.zig").validateEditable(text.raw) else if (!cross_fields) try @import("hyperlink_source.zig").validate(text.raw);
        if (!links_checked) {
            var tokens = text.tokens();
            while (try tokens.next()) |token| {
                if (token.value == .control and token.value.control.kind == .extended) {
                    try @import("control_source.zig").validate(a, tree);
                    break;
                }
            }
        }
    } else if (h.characterUnits() > 1) return error.UnsupportedMissingText;
    return .{ .ranges = ranges, .preserved_direct_records = preserved_direct_records };
}
