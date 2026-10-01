//! Model-backed selected paragraph serialization; untouched records stay raw.
const std = @import("std");
const model = @import("../../model/document.zig");
const framing = @import("../record.zig");
const writer = @import("../record_writer.zig");
const body = @import("../body/reader.zig");
const plain = @import("plain_text.zig");
const Tree = @import("../body/tree.zig").Tree;
const children = @import("../body/paragraph_children.zig");
const Version = @import("../version.zig").Version;

pub fn write(a: std.mem.Allocator, source: []const u8, section: model.Section, version: Version, limit: usize) ![]u8 {
    var tree = try Tree.parseTextPreview(a, source, version, .{});
    defer tree.deinit(a);
    const paragraph_by_node = try a.alloc(?usize, tree.nodes.len);
    defer a.free(paragraph_by_node);
    @memset(paragraph_by_node, null);
    for (section.paragraphs, 0..) |p, index| {
        const source_node = try p.originalNode();
        if (source_node >= tree.nodes.len or tree.nodes[source_node].record.value != .header or paragraph_by_node[source_node] != null)
            return error.SourceBindingMismatch;
        paragraph_by_node[source_node] = index;
        if (p.formula_results) |results| {
            if (p.range_tags == null) return error.FormulaDisplayMismatch;
            for (results, 0..) |result, i| {
                if (p.field_attributes) |fields| {
                    if (@import("field_attributes.zig").find(fields, result.source_node) != null) return error.UnsupportedFieldAttributeCombination;
                }
                if (result.source_node >= tree.nodes.len or tree.nodes[result.source_node].parent != source_node) return error.SourceBindingMismatch;
                for (results[0..i]) |previous| if (previous.source_node == result.source_node) return error.SourceBindingMismatch;
                const entry = tree.nodes[result.source_node].record.framing;
                if (entry.tag != @intFromEnum(body.Tag.control_header)) return error.SourceBindingMismatch;
                const header = try body.ControlHeader.parse(entry.payload);
                if (header.id != @import("../body/control_rules.zig").id("%fmu")) return error.SourceBindingMismatch;
                var ordinal: usize = 0;
                var child: usize = @as(usize, source_node) + 1;
                while (child < result.source_node) {
                    const preceding = tree.nodes[child];
                    if (preceding.parent == source_node and preceding.record.framing.tag == @intFromEnum(body.Tag.control_header)) {
                        if ((try body.ControlHeader.parse(preceding.record.framing.payload)).id == header.id) ordinal += 1;
                    }
                    child = preceding.subtree_end;
                }
                const bytes = try plain.textBytes(a, p);
                defer a.free(bytes);
                var display = try @import("formula_display_writer.zig").prepare(a, bytes, try @import("../body/field_start.zig").Properties.parse(header.properties), result, ordinal);
                defer display.deinit(a);
                if (!std.mem.eql(u8, bytes, display.bytes)) return error.FormulaDisplayMismatch;
            }
        }
    }
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    var it = framing.Iterator.init(source, .{});
    var paragraph_index: usize = 0;
    var record_index: usize = 0;
    while (try it.next()) |record| {
        const node_index = record_index;
        record_index += 1;
        const parent_paragraph = if (tree.nodes[node_index].parent) |parent| paragraph_by_node[parent] else null;
        if (record.tag == @intFromEnum(body.Tag.paragraph_header)) {
            if (paragraph_index >= section.paragraphs.len) return error.SourceBindingMismatch;
            const p = section.paragraphs[paragraph_index];
            if (try p.originalNode() != node_index) return error.SourceBindingMismatch;
            paragraph_index += 1;
            const bytes = try a.dupe(u8, record.payload);
            defer a.free(bytes);
            bytes[body.Header.style_id_offset] = p.style_id;
            std.mem.writeInt(u32, bytes[body.Header.instance_id_offset..][0..4], p.instance_id, .little);
            if (p.range_tags) |ranges| {
                if (p.character_runs.len > 65535 or ranges.len > 65535) return error.LimitExceeded;
                body.Header.writeTextCounts(bytes, p.declared_units, @intCast(p.character_runs.len), @intCast(ranges.len));
            }
            if (std.mem.eql(u8, bytes, record.payload)) {
                try out.appendSlice(a, record.raw);
            } else {
                // Fixed-width header edits preserve its original framing, including
                // a noncanonical extended-size representation of a short payload.
                try out.appendSlice(a, record.raw[0 .. record.raw.len - record.payload.len]);
                try out.appendSlice(a, bytes);
            }
            // Bind to immutable source presence, not a mutable duplicate flag.
            // New text precedes metadata, even when the paragraph had no text.
            if (p.range_tags != null and (try children.collect(tree, try p.originalNode())).text_node == null) {
                if (record.level == std.math.maxInt(u10)) return error.LimitExceeded;
                const text = try plain.textBytes(a, p);
                defer a.free(text);
                try writer.append(a, &out, @intFromEnum(body.Tag.paragraph_text), record.level + 1, text, limit);
            }
        } else if (parent_paragraph != null and section.paragraphs[parent_paragraph.?].range_tags != null) {
            const p = section.paragraphs[parent_paragraph.?];
            switch (record.tag) {
                @intFromEnum(body.Tag.paragraph_text) => {
                    const bytes = try plain.textBytes(a, p);
                    defer a.free(bytes);
                    try writer.append(a, &out, record.tag, record.level, bytes, limit);
                },
                @intFromEnum(body.Tag.char_runs) => {
                    const bytes = try a.alloc(u8, p.character_runs.len * 8);
                    defer a.free(bytes);
                    for (p.character_runs, 0..) |run, i| {
                        std.mem.writeInt(u32, bytes[i * 8 ..][0..4], run.start_unit, .little);
                        std.mem.writeInt(u32, bytes[i * 8 + 4 ..][0..4], run.char_shape_id, .little);
                    }
                    try writer.append(a, &out, record.tag, record.level, bytes, limit);
                },
                @intFromEnum(body.Tag.range_tags) => {
                    const bytes = try a.alloc(u8, p.range_tags.?.len * 12);
                    defer a.free(bytes);
                    for (p.range_tags.?, 0..) |r, i| {
                        std.mem.writeInt(u32, bytes[i * 12 ..][0..4], r.start_unit, .little);
                        std.mem.writeInt(u32, bytes[i * 12 + 4 ..][0..4], r.end_unit, .little);
                        std.mem.writeInt(u32, bytes[i * 12 + 8 ..][0..4], r.tag, .little);
                    }
                    try writer.append(a, &out, record.tag, record.level, bytes, limit);
                },
                @intFromEnum(body.Tag.line_segments) => {}, // Invalid cache, never guessed.
                @intFromEnum(body.Tag.control_header) => {
                    var formula: ?model.FormulaResult = null;
                    if (p.formula_results) |results| for (results) |result| {
                        if (result.source_node == node_index) formula = result;
                    };
                    if (formula) |result| {
                        const bytes = try @import("formula_record_writer.zig").prepare(a, record, node_index, result, limit - @min(limit, out.items.len));
                        defer a.free(bytes);
                        try out.appendSlice(a, bytes);
                        continue;
                    }
                    const attributes = if (p.field_attributes) |fields| @import("field_attributes.zig").find(fields, node_index) else null;
                    if (attributes) |value| {
                        try appendField(a, &out, record, value);
                    } else try out.appendSlice(a, record.raw);
                },
                else => return error.UnsupportedParagraphRecord,
            }
        } else if (record.tag == @intFromEnum(body.Tag.control_header) and parent_paragraph != null) {
            const fields = section.paragraphs[parent_paragraph.?].field_attributes;
            const attributes = if (fields) |values| @import("field_attributes.zig").find(values, node_index) else null;
            if (attributes) |value| try appendField(a, &out, record, value) else try out.appendSlice(a, record.raw);
        } else try out.appendSlice(a, record.raw);
        if (out.items.len > limit) return error.LimitExceeded;
    }
    if (paragraph_index != section.paragraphs.len) return error.SourceBindingMismatch;
    return out.toOwnedSlice(a);
}

fn appendField(a: std.mem.Allocator, out: *std.ArrayList(u8), record: anytype, attributes: u32) !void {
    if (record.payload.len < 8) return error.SourceBindingMismatch;
    const bytes = try a.dupe(u8, record.raw);
    defer a.free(bytes);
    std.mem.writeInt(u32, bytes[record.raw.len - record.payload.len + 4 ..][0..4], attributes, .little);
    try out.appendSlice(a, bytes);
}
