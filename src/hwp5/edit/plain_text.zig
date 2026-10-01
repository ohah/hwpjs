//! Controlled UTF-16 splices. Layout and opaque relocation are not implemented.
const std = @import("std");
const model = @import("../../model/document.zig");
const body = @import("../body/reader.zig");
const Version = @import("../version.zig").Version;
const scalars = @import("../../text/scalars.zig");

pub const Splice = struct {
    section: usize,
    paragraph: usize,
    start_unit: u32,
    end_unit: u32,
    utf8: []const u8,
    /// Explicit experimental convention, not inferred from the HWP specification.
    range_policy: enum { reject, half_open } = .reject,
};

pub const textBytes = @import("plain_text_content.zig").textBytes;

fn inserted(a: std.mem.Allocator, utf8: []const u8) ![]u8 {
    if (utf8.len > 4 * 1024 * 1024) return error.LimitExceeded;
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    var offset: usize = 0;
    while (try scalars.read(utf8, offset, .utf8)) |c| {
        if (c.value < 32) return error.UnsupportedTextControl;
        var buf: [4]u8 = undefined;
        if (c.value <= 0xffff) {
            std.mem.writeInt(u16, buf[0..2], @intCast(c.value), .little);
            try out.appendSlice(a, buf[0..2]);
        } else {
            const v = c.value - 0x10000;
            std.mem.writeInt(u16, buf[0..2], @intCast(0xd800 + (v >> 10)), .little);
            std.mem.writeInt(u16, buf[2..4], @intCast(0xdc00 + (v & 1023)), .little);
            try out.appendSlice(a, &buf);
        }
        offset = c.end;
    }
    return out.toOwnedSlice(a);
}

pub fn apply(a: std.mem.Allocator, source: []const u8, version: Version, p: *model.Paragraph, edit: Splice, char_count: usize) !void {
    return applyWith(a, source, version, p, edit, char_count, false, false);
}

pub fn applyFormulaTransaction(a: std.mem.Allocator, source: []const u8, version: Version, p: *model.Paragraph, edit: Splice, char_count: usize) !void {
    return applyWith(a, source, version, p, edit, char_count, true, false);
}

pub fn applyHyperlinkTransaction(a: std.mem.Allocator, source: []const u8, version: Version, p: *model.Paragraph, edit: Splice, char_count: usize) !void {
    return applyWith(a, source, version, p, edit, char_count, false, true);
}

fn applyWith(a: std.mem.Allocator, source: []const u8, version: Version, p: *model.Paragraph, edit: Splice, char_count: usize, formulas: bool, cross_fields: bool) !void {
    const validator = @import("plain_text_source.zig");
    const validated = if (formulas) try validator.validateFormulaTransaction(a, source, version, p.*, char_count) else if (cross_fields) try validator.validateHyperlinkTransaction(a, source, version, p.*, char_count) else try validator.validate(a, source, version, p.*, char_count);
    const ranges = validated.ranges;
    const before = try @import("plain_text_content.zig").editableTextBytes(a, p.*);
    defer a.free(before);
    try @import("control_boundaries.zig").validateRetainedText(before);
    try @import("control_boundaries.zig").validate(before, edit.start_unit, edit.end_unit);
    const add = try inserted(a, edit.utf8);
    defer a.free(add);
    const output_len = before.len - @as(usize, edit.end_unit - edit.start_unit) * 2 + add.len;
    if (output_len > 8 * 1024 * 1024) return error.LimitExceeded;
    if (ranges != null and ranges.?.count() != 0 and edit.range_policy == .reject) return error.UnsupportedRangeSemantics;
    const after = try a.alloc(u8, output_len);
    defer a.free(after);
    const start = @as(usize, edit.start_unit) * 2;
    const end = @as(usize, edit.end_unit) * 2;
    @memcpy(after[0..start], before[0..start]);
    @memcpy(after[start..][0..add.len], add);
    @memcpy(after[start + add.len ..], before[end..]);
    if (std.mem.eql(u8, before, after)) return;
    if (formulas) try @import("../body/field_span.zig").protectFormulaLabels(before, edit.start_unit, edit.end_unit);
    const units: u32 = @intCast(add.len / 2);
    const run_editor = @import("character_runs.zig");
    try run_editor.validate(p.character_runs, before, char_count);
    const owned_runs = try run_editor.replace(a, p.character_runs, edit.start_unit, edit.end_unit, units, null);
    errdefer a.free(owned_runs);
    const owned_ranges = try @import("text_ranges.zig").prepare(a, p.range_tags, ranges, before, edit.start_unit, edit.end_unit, units);
    errdefer a.free(owned_ranges);
    const owned_fields = if (cross_fields) (if (p.field_attributes) |fields| try a.dupe(model.FieldAttributes, fields) else null) else try @import("field_attributes.zig").prepare(a, source, version, p.*, before, edit.start_unit, edit.end_unit);
    errdefer if (owned_fields) |fields| a.free(fields);
    const value = try body.Text.parse(after);
    var tokens: std.ArrayList(model.Token) = .empty;
    errdefer {
        for (tokens.items) |t| a.free(t.raw);
        tokens.deinit(a);
    }
    var it = value.tokens();
    while (try it.next()) |token| {
        const raw = try a.dupe(u8, token.raw);
        errdefer a.free(raw);
        try tokens.append(a, .{ .start_unit = @intCast(token.start_unit), .kind = if (token.value == .text) .text else .control, .encoding = .utf16le, .raw = raw });
    }
    const owned_tokens = try tokens.toOwnedSlice(a);
    for (p.tokens) |t| a.free(t.raw);
    a.free(p.tokens);
    a.free(p.character_runs);
    if (p.range_tags) |rr| a.free(rr);
    if (p.field_attributes) |fields| a.free(fields);
    p.tokens = owned_tokens;
    p.text_present = true;
    p.character_runs = owned_runs;
    p.range_tags = owned_ranges;
    p.field_attributes = owned_fields;
    p.declared_units = @intCast(after.len / 2);
    p.deferred_direct_records = validated.preserved_direct_records;
}
