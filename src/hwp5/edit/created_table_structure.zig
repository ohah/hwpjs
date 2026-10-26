//! Atomic paragraph topology plus native generated-table anchor ownership.
const std = @import("std");
const model = @import("../../model/document.zig");
const Values = @import("created_table_values.zig").Values;
const anchors = @import("created_table_anchor.zig");
const mapping = @import("created_table_anchor_structure.zig");
const records = @import("created_table_records.zig");
pub const Command = union(enum) { split: @import("structure_session.zig").Split, merge: @import("merge_session.zig").Merge };

// Once hosts coalesce, equal-unit ties must retain prior document order,
// not the order in which the user happened to create their tables.
fn orderMergedHosts(a: std.mem.Allocator, tables: *Values, left: anchors.Host, right: anchors.Host) !void {
    var left_count: usize = 0;
    var right_count: usize = 0;
    for (tables.entries) |entry| {
        if (std.meta.eql(entry.anchor.host, left)) left_count += 1;
        if (std.meta.eql(entry.anchor.host, right)) right_count += 1;
    }
    if (left_count == 0 or right_count == 0) return;
    const ordered = try a.alloc(@import("created_table_values.zig").Entry, left_count + right_count);
    defer a.free(ordered);
    var count: usize = 0;
    for ([_]anchors.Host{ left, right }) |host| for (tables.entries) |entry| {
        if (std.meta.eql(entry.anchor.host, host)) {
            ordered[count] = entry;
            count += 1;
        }
    };
    var index: usize = 0;
    for (tables.entries) |*entry| {
        if (std.meta.eql(entry.anchor.host, left) or std.meta.eql(entry.anchor.host, right)) {
            entry.* = ordered[index];
            index += 1;
        }
    }
}

pub fn apply(a: std.mem.Allocator, decoded: []const []u8, document: *model.Document, pending: []Values, version: @import("../version.zig").Version, command: Command, resources: records.Resources, limits: records.Limits) !void {
    const si = switch (command) {
        .split => |e| e.section,
        .merge => |e| e.section,
    };
    const pi = switch (command) {
        .split => |e| e.paragraph,
        .merge => |e| e.paragraph,
    };
    if (si >= document.sections.len or pending.len != document.sections.len or decoded.len != document.sections.len) return error.InvalidSection;
    const before = &document.sections[si];
    if (pi >= before.paragraphs.len) return error.InvalidParagraph;
    const host = try anchors.identity(before.paragraphs[pi]);
    // Other sections/resources are borrowed read-only; only target is owned.
    var draft = document.*;
    draft.sections = try a.dupe(model.Section, document.sections);
    defer a.free(draft.sections);
    draft.sections[si] = try @import("../../model/clone.zig").section(a, before.*);
    defer draft.sections[si].deinit(a);
    var tables = try pending[si].clone(a, limits.max_bytes);
    defer tables.deinit(a);
    switch (command) {
        .split => |edit| {
            if (edit.end_unit) |end| {
                if (end < edit.at_unit) return error.InvalidTextPosition;
                try tables.rebase(host, edit.at_unit, end - edit.at_unit, 0);
            }
            var reserved: std.ArrayList(u32) = .empty;
            defer reserved.deinit(a);
            for (pending) |values| for (values.entries) |entry| {
                try reserved.append(a, entry.value.table.instance_id);
                for (entry.value.table.cells) |cell| try reserved.append(a, cell.paragraph_id);
            };
            try @import("structure_session.zig").splitWithReservedIds(a, decoded, &draft, version, edit, resources.paragraphs.char_shapes, limits.max_bytes, reserved.items);
            const right = draft.sections[si].paragraphs[pi + 1];
            try mapping.split(tables.entries, host, right.instance_id, edit.at_unit);
        },
        .merge => |edit| {
            if (before.paragraphs.len - pi < 2) return error.InvalidParagraph;
            const right = try anchors.identity(before.paragraphs[pi + 1]);
            const text = try @import("plain_text_content.zig").editableTextBytes(a, before.paragraphs[pi]);
            defer a.free(text);
            if (text.len < 2 or text.len % 2 != 0 or std.mem.readInt(u16, text[text.len - 2 ..][0..2], .little) != 13) return error.UnsupportedParagraphTerminator;
            const units = std.math.cast(u32, text.len / 2 - 1) orelse return error.LimitExceeded;
            try @import("merge_session.zig").apply(a, decoded, &draft, version, edit, resources.paragraphs.char_shapes, limits.max_bytes);
            try orderMergedHosts(a, &tables, host, right);
            try mapping.merge(tables.entries, host, right, units);
        },
    }
    const verified = try @import("created_table_section.zig").write(a, decoded[si], draft.sections[si], &tables, version, resources, limits);
    defer a.free(verified);
    std.mem.swap(model.Section, before, &draft.sections[si]);
    std.mem.swap(Values, &pending[si], &tables);
}
