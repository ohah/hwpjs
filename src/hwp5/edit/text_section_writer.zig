//! Model-backed selected paragraph serialization; untouched records stay raw.
const std = @import("std");
const model = @import("../../model/document.zig");
const framing = @import("../record.zig");
const writer = @import("../record_writer.zig");
const body = @import("../body/reader.zig");
const plain = @import("plain_text.zig");

pub fn write(a: std.mem.Allocator, source: []const u8, section: model.Section, limit: usize) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    var it = framing.Iterator.init(source, .{});
    var paragraph_index: usize = 0;
    var current: ?model.Paragraph = null;
    var level: u10 = 0;
    while (try it.next()) |record| {
        // A sibling or ancestor closes this paragraph's subtree, regardless
        // of its tag. Later descendants belong to that new owner, not to us.
        if (current != null and record.level <= level) current = null;
        if (record.tag == @intFromEnum(body.Tag.paragraph_header)) {
            if (paragraph_index >= section.paragraphs.len) return error.SourceBindingMismatch;
            const p = section.paragraphs[paragraph_index];
            paragraph_index += 1;
            current = p;
            level = record.level;
            const bytes = try a.dupe(u8, record.payload);
            defer a.free(bytes);
            bytes[body.Header.style_id_offset] = p.style_id;
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
        } else if (current != null and current.?.range_tags != null and record.level == level + 1) {
            const p = current.?;
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
                else => return error.UnsupportedParagraphRecord,
            }
        } else try out.appendSlice(a, record.raw);
        if (out.items.len > limit) return error.LimitExceeded;
    }
    if (paragraph_index != section.paragraphs.len) return error.SourceBindingMismatch;
    return out.toOwnedSlice(a);
}
