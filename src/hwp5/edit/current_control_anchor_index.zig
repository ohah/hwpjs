//! Batch equivalent of current_control_anchor.position, with one token/source pass.
const std = @import("std");
const Link = @import("../body/control_links.zig").Link;
const Paragraph = @import("../../model/document.zig").Paragraph;
const Key = struct { paragraph_node: usize, code: u16, id: u32 };
const Bucket = struct { units: std.ArrayList(u32) = .empty, next: usize = 0 };

/// The owned output follows source-link order. No owner or token identity is guessed.
pub fn positions(a: std.mem.Allocator, links: []const Link, paragraphs: []const Paragraph) ![]u32 {
    var owners = try @import("current_paragraph_sources.zig").build(a, paragraphs);
    defer owners.deinit(a);
    var buckets: std.AutoHashMapUnmanaged(Key, Bucket) = .empty;
    defer {
        var entries = buckets.valueIterator();
        while (entries.next()) |entry| entry.units.deinit(a);
        buckets.deinit(a);
    }
    for (paragraphs) |paragraph| {
        const source = paragraph.source_node orelse continue;
        for (paragraph.tokens) |token| {
            if (token.kind != .control or token.raw.len != 16) continue;
            const key: Key = .{
                .paragraph_node = source,
                .code = std.mem.readInt(u16, token.raw[0..2], .little),
                .id = std.mem.readInt(u32, token.raw[2..6], .little),
            };
            const entry = try buckets.getOrPut(a, key);
            if (!entry.found_existing) entry.value_ptr.* = .{};
            try entry.value_ptr.units.append(a, token.start_unit);
        }
    }
    const result = try a.alloc(u32, links.len);
    errdefer a.free(result);
    for (links, result) |link, *unit| {
        const source = std.math.cast(u32, link.paragraph_node) orelse return error.MissingCurrentControlAnchor;
        if (!owners.contains(source)) return error.MissingCurrentControlAnchor;
        const bucket = buckets.getPtr(.{ .paragraph_node = link.paragraph_node, .code = link.code, .id = link.id }) orelse return error.MissingCurrentControlAnchor;
        if (bucket.next >= bucket.units.items.len) return error.MissingCurrentControlAnchor;
        unit.* = bucket.units.items[bucket.next];
        bucket.next += 1;
    }
    return result;
}
