//! Source eligibility and metadata validation, separate from mutable splicing.
const std = @import("std");
const model = @import("../../model/document.zig");
const body = @import("../body/reader.zig");
const Tree = @import("../body/tree.zig").Tree;
const children = @import("../body/paragraph_children.zig");
const Version = @import("../version.zig").Version;

pub const validateSection = @import("source_policy.zig").validate;
pub const Validation = struct { ranges: ?body.Ranges, preserved_direct_records: usize };
const Purpose = enum { splice, formula_transaction, hyperlink_transaction, field_transaction, character_format };

/// Caller must validate source-backed mixed bindings and formula protection.
pub fn validateFieldTransaction(a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, char_count: usize) !Validation {
    return validateWith(a, source, version, p, char_count, .field_transaction);
}

/// Returned ranges borrow source, not the temporary Tree nodes.
pub fn validate(a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, char_count: usize) !Validation {
    return validateWith(a, source, version, p, char_count, .splice);
}

pub fn validateFormulaTransaction(a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, char_count: usize) !Validation {
    return validateWith(a, source, version, p, char_count, .formula_transaction);
}

/// Only a section transaction with validated hyperlink spans may use this.
pub fn validateHyperlinkTransaction(a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, char_count: usize) !Validation {
    return validateWith(a, source, version, p, char_count, .hyperlink_transaction);
}

/// Formatting retains text positions, including formula and spanning fields.
pub fn validateCharacterFormat(a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, char_count: usize) !Validation {
    return validateWith(a, source, version, p, char_count, .character_format);
}

fn validateWith(a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, char_count: usize, comptime purpose: Purpose) !Validation {
    const generated = p.source_node == null;
    const source_node = if (generated) p.header_template orelse return error.MissingParagraphSource else try p.originalNode();
    if (generated and (p.instance_id == 0 or p.field_attributes != null or p.formula_results != null)) return error.UnsupportedStructuralControl;
    var tree = try Tree.parseTextPreview(a, source, version, .{});
    defer tree.deinit(a);
    if (source_node >= tree.nodes.len or tree.nodes[source_node].record.value != .header) return error.SourceBindingMismatch;
    const node = tree.nodes[source_node];
    const parent: ?usize = if (p.parent_node) |value| @as(usize, value) else null;
    if (node.parent != parent) return error.SourceBindingMismatch;
    const h = node.record.value.header;
    if (h.extra.len != 0 or (h.merge_tracking orelse 0) != 0) return error.UnsupportedParagraphExtension;
    if (h.control_mask & ~@import("control_boundaries.zig").retained_mask != 0) return error.UnsupportedTextControl;
    switch (purpose) {
        .formula_transaction => _ = try @import("source_policy.zig").hasFormulas(a, source, version),
        .character_format => {
            if (try @import("source_policy.zig").hasNamedFields(source)) {
                try @import("source_policy.zig").validateCharacterFormat(a, source, version);
            } else _ = try @import("source_policy.zig").hasFormulas(a, source, version);
        },
        .splice, .hyperlink_transaction => try validateSection(a, source, version),
        .field_transaction => try @import("source_policy.zig").validateFieldTextTransaction(a, source, version),
    }
    try @import("paragraph_owner.zig").validate(a, tree, source_node, version);
    var links_checked = false;
    var preserved_direct_records: usize = 0;
    var runs: ?body.Runs = null;
    var ranges: ?body.Ranges = null;
    var lines: ?body.Segments = null;
    var child = @as(usize, source_node) + 1;
    while (child < node.subtree_end) {
        const entry = tree.nodes[child];
        if (entry.parent != source_node) return error.UnsupportedParagraphRecord;
        if (entry.record.framing.tag == 72 or entry.record.framing.tag == 66) {
            var groups = try @import("paragraph_owner.zig").inspectGroups(a, tree, version);
            defer groups.deinit(a);
            const list = if (entry.record.framing.tag == 72) child else (try @import("paragraph_owner.zig").logicalOwner(tree, groups, child)) orelse return error.OrphanListParagraph;
            try @import("paragraph_owned_list.zig").validate(tree, groups, source_node, list);
            preserved_direct_records += 1;
            child = entry.subtree_end;
            continue;
        }
        if (entry.record.framing.tag == @intFromEnum(body.Tag.control_header)) {
            preserved_direct_records += 1;
            if (!links_checked) try @import("control_source.zig").validateWithSource(a, tree, source, version);
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
    const parts = try children.collect(tree, source_node);
    const column_continuation = generated and preserved_direct_records != 0;
    if (column_continuation) try @import("column_split_scope.zig").validateTemplate(tree, source_node);
    if (parts.text_node) |text_node| {
        const text = tree.nodes[text_node].record.value.text;
        try text.validateCount(h);
        if (generated and !column_continuation) try @import("plain_text_content.zig").validatePlain(text.raw);
        switch (purpose) {
            .formula_transaction => try @import("../body/field_span.zig").validateEditable(text.raw),
            .splice => try @import("hyperlink_source.zig").validate(text.raw),
            .hyperlink_transaction, .field_transaction, .character_format => {},
        }
        if (!links_checked) {
            var tokens = text.tokens();
            while (try tokens.next()) |token| {
                if (token.value == .control and token.value.control.kind == .extended) {
                    try @import("control_source.zig").validateWithSource(a, tree, source, version);
                    break;
                }
            }
        }
    } else if (h.characterUnits() > 1) return error.UnsupportedMissingText;
    if (generated) {
        if (preserved_direct_records != 0 and !column_continuation) return error.UnsupportedStructuralControl;
        if (ranges) |value| if (value.count() != 0) return error.UnsupportedRangeSemantics;
        if (p.range_tags) |value| if (value.len != 0) return error.UnsupportedRangeSemantics;
        const current = try @import("plain_text_content.zig").editableTextBytes(a, p);
        defer a.free(current);
        try @import("plain_text_content.zig").validatePlain(current);
    }
    return .{ .ranges = ranges, .preserved_direct_records = if (generated) 0 else preserved_direct_records };
}

test "reference click source eligibility stays scoped to validated field transaction" {
    const a = std.testing.allocator;
    const input = std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue1891/80250_regulatory_analysis.hwpx", a, .limited(16_000_000)) catch |err| switch (err) {
        error.FileNotFound => return error.SkipZigTest,
        else => return err,
    };
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    var doc = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{bytes});
    defer doc.deinit(a);
    const bound = try @import("field_bindings.zig").collect(a, bytes, source.header.version(), doc.sections[0]);
    defer a.free(bound);
    const p = doc.sections[0].paragraphs[bound[0].span.begin.paragraph];
    _ = try validateFieldTransaction(a, bytes, source.header.version(), p, 65536);
    try std.testing.expectError(error.UnsupportedSectionControl, validate(a, bytes, source.header.version(), p, 65536));
}
