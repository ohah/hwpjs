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
const boundary = @import("plain_text_content.zig").boundary;
const validatePlain = @import("plain_text_content.zig").validatePlain;

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

/// Deleted positions collapse to the start; insertion is right-affine.
fn position(pos: u32, start: u32, end: u32, added: u32) u32 {
    return if (pos < start) pos else if (pos >= end) pos - (end - start) + added else start;
}

pub fn apply(a: std.mem.Allocator, source: []const u8, version: Version, p: *model.Paragraph, edit: Splice, char_count: usize) !void {
    const ranges = try @import("plain_text_source.zig").validate(a, source, version, p.*, char_count);
    const before = try @import("plain_text_content.zig").editableTextBytes(a, p.*);
    defer a.free(before);
    try validatePlain(before);
    if (edit.start_unit > edit.end_unit or edit.end_unit > before.len / 2 - 1) return error.InvalidTextPosition;
    try boundary(before, edit.start_unit);
    try boundary(before, edit.end_unit);
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
    const units: u32 = @intCast(add.len / 2);
    const run_editor = @import("character_runs.zig");
    try run_editor.validate(p.character_runs, before, char_count);
    const owned_runs = try run_editor.replace(a, p.character_runs, edit.start_unit, edit.end_unit, units, null);
    errdefer a.free(owned_runs);
    var mapped_ranges: std.ArrayList(model.TextRange) = .empty;
    defer mapped_ranges.deinit(a);
    const original_ranges = if (ranges) |r| r.count() else 0;
    const range_count = if (p.range_tags) |r| r.len else original_ranges;
    for (0..range_count) |i| {
        const r: model.TextRange = if (p.range_tags) |rr| rr[i] else .{ .start_unit = ranges.?.get(i).?.start, .end_unit = ranges.?.get(i).?.end, .tag = ranges.?.get(i).?.tag };
        try boundary(before, r.start_unit);
        try boundary(before, r.end_unit);
        const s = position(r.start_unit, edit.start_unit, edit.end_unit, units);
        const e = position(r.end_unit, edit.start_unit, edit.end_unit, units);
        if (s < e) try mapped_ranges.append(a, .{ .start_unit = s, .end_unit = e, .tag = r.tag });
    }
    if (mapped_ranges.items.len > 65535) return error.LimitExceeded;
    const owned_ranges = try mapped_ranges.toOwnedSlice(a);
    errdefer a.free(owned_ranges);
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
    p.tokens = owned_tokens;
    p.text_present = true;
    p.character_runs = owned_runs;
    p.range_tags = owned_ranges;
    p.declared_units = @intCast(after.len / 2);
    p.deferred_direct_records = 0;
}
