//! Candidate-only section preparation. Does not touch CFB, Session dirty,
//! history, version, resource IDs or layout authority. No public ABI is added.
const std = @import("std");
const records = @import("../record.zig");
const writer = @import("../record_writer.zig");
const codec = @import("../body/line_segment_writer.zig");
const Header = @import("../body/paragraph_header.zig").Header;
const Version = @import("../version.zig").Version;
pub const Patch = struct {
    header_ordinal: usize,
    expected_text: []const u8,
    segments: []const codec.Segment,
};
pub const Prepared = struct {
    bytes: []u8,
    records_visited: usize,
    patched_paragraphs: usize,
    pub fn deinit(self: Prepared, a: std.mem.Allocator) void {
        a.free(self.bytes);
    }
};

/// Full framing pass plus disjoint selected ranges: O(records + text + lines).
/// Preserves every original byte except selected count2 and direct tag69.
pub fn prepare(a: std.mem.Allocator, source: []const u8, version: Version, patches: []const Patch, limit: usize) !Prepared {
    if (source.len > limit) return error.LimitExceeded;
    var total_units: usize = 0;
    var total_lines: usize = 0;
    for (patches) |patch| {
        total_units = try std.math.add(usize, total_units, patch.expected_text.len / 2);
        total_lines = try std.math.add(usize, total_lines, patch.segments.len);
        if (total_units > 4 * 1024 * 1024 or total_lines > 262144) return error.LayoutLimitExceeded;
    }
    var all: std.ArrayList(records.Record) = .empty;
    defer all.deinit(a);
    var iterator = records.Iterator.init(source, .{ .max_payload_bytes = limit });
    while (try iterator.next()) |record| try all.append(a, record);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    var cursor: usize = 0;
    var visited: usize = all.items.len;
    for (patches) |patch| {
        if (patch.header_ordinal < cursor or patch.header_ordinal >= all.items.len) return error.UnorderedLayoutPatch;
        const h = all.items[patch.header_ordinal];
        if (h.tag != 66 or h.level != 0) return error.UnsupportedLayoutOwner;
        const header = try Header.parse(h.payload, version);
        if (header.extra.len != 0) return error.UnsupportedLayoutHeaderTail;
        var end = patch.header_ordinal + 1;
        var text: ?[]const u8 = null;
        var cache: ?usize = null;
        var runs: ?usize = null;
        while (end < all.items.len and all.items[end].level > 0) : (end += 1) {
            const record = all.items[end];
            visited += 1;
            if (record.tag == 66) return error.UnsupportedNestedLayoutOwner;
            if (record.level != 1) continue;
            if (record.tag == 67) {
                if (text != null) return error.DuplicateLayoutText;
                text = record.payload;
            } else if (record.tag == 68) {
                if (runs != null) return error.DuplicateLayoutRuns;
                runs = end;
            } else if (record.tag == 69) {
                if (cache != null or record.payload.len % 36 != 0 or record.payload.len / 36 != header.line_segment_count) return error.InvalidOriginalLayoutCache;
                cache = end;
            }
        }
        const raw_text = text orelse return error.MissingLayoutText;
        if (runs == null) return error.MissingLayoutRuns;
        if ((cache == null and header.line_segment_count != 0) or raw_text.len % 2 != 0 or raw_text.len / 2 != header.characterUnits()) return error.OriginalLayoutCountMismatch;
        if (!std.mem.eql(u8, raw_text, patch.expected_text)) return error.LayoutSourceChanged;
        const payload = try codec.encode(a, raw_text, version, patch.segments, limit);
        defer a.free(payload);
        for (all.items[cursor..patch.header_ordinal]) |record| try appendRaw(a, &out, record.raw, limit);
        const replacement = try a.dupe(u8, h.raw);
        defer a.free(replacement);
        const at = h.raw.len - h.payload.len + Header.line_segment_count_offset;
        std.mem.writeInt(u16, replacement[at..][0..2], @intCast(patch.segments.len), .little);
        try appendRaw(a, &out, replacement, limit);
        for (patch.header_ordinal + 1..end) |index| {
            if (cache != null and index == cache.?) {
                if (std.mem.eql(u8, all.items[index].payload, payload)) {
                    try appendRaw(a, &out, all.items[index].raw, limit);
                } else {
                    try writer.append(a, &out, 69, 1, payload, limit);
                }
            } else {
                try appendRaw(a, &out, all.items[index].raw, limit);
                if (cache == null and index == runs.?) try writer.append(a, &out, 69, 1, payload, limit);
            }
        }
        cursor = end;
    }
    for (all.items[cursor..]) |record| try appendRaw(a, &out, record.raw, limit);
    return .{ .bytes = try out.toOwnedSlice(a), .records_visited = visited, .patched_paragraphs = patches.len };
}

fn appendRaw(a: std.mem.Allocator, out: *std.ArrayList(u8), bytes: []const u8, limit: usize) !void {
    if (out.items.len > limit or bytes.len > limit - out.items.len) return error.LimitExceeded;
    try out.appendSlice(a, bytes);
}
