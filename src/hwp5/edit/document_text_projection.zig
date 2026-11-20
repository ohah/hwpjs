//! Native search text and its source axis share this projection. Extended
//! control payloads are never interpreted as text or granted edit permission.
const std = @import("std");
pub const Span = struct {
    start: u32,
    end: u32,
    source_start: u32,
    source_end: u32,
    protected: bool,
};
pub const Projection = struct {
    raw: []u8,
    text: []u8,
    spans: []Span,
    source_units: u32,
    pub fn deinit(self: *Projection, a: std.mem.Allocator) void {
        a.free(self.raw);
        a.free(self.text);
        a.free(self.spans);
        self.* = undefined;
    }
};

pub fn read(a: std.mem.Allocator, raw: []const u8) !Projection {
    if (raw.len > 2 * @import("../../model/text_transaction.zig").limits.text_units) return error.LimitExceeded;
    const parsed = try @import("../body/text.zig").Text.parse(raw);
    var tokens = parsed.tokens();
    var text: std.ArrayList(u8) = .empty;
    defer text.deinit(a);
    var spans: std.ArrayList(Span) = .empty;
    defer spans.deinit(a);
    var units: u32 = 0;
    var ended = false;
    while (try tokens.next()) |token| {
        if (ended) return error.UnsupportedParagraphTerminator;
        const source_start = std.math.cast(u32, token.start_unit) orelse return error.LimitExceeded;
        const source_end = std.math.cast(u32, token.start_unit + token.raw.len / 2) orelse return error.LimitExceeded;
        const begin = units;
        var protected = false;
        switch (token.value) {
            .text => |bytes| {
                var offset: usize = 0;
                while (try @import("../../text/scalars.zig").read(bytes, offset, .utf16le)) |scalar| {
                    var encoded: [4]u8 = undefined;
                    const n = try std.unicode.utf8Encode(scalar.value, &encoded);
                    try text.appendSlice(a, encoded[0..n]);
                    offset = scalar.end;
                }
                units = std.math.add(u32, units, source_end - source_start) catch return error.LimitExceeded;
            },
            .control => |control| {
                if (control.code == 13) {
                    if (source_end != raw.len / 2) return error.UnsupportedParagraphTerminator;
                    ended = true;
                    continue;
                }
                const visible: []const u8 = switch (control.code) {
                    10 => "\n",
                    24 => "\xc2\xad",
                    30, 31 => "\xc2\xa0",
                    9 => "\t",
                    3 => "\xc2\xab",
                    4 => "\xc2\xbb",
                    else => "\xef\xbf\xbc",
                };
                try text.appendSlice(a, visible);
                units = std.math.add(u32, units, 1) catch return error.LimitExceeded;
                // Inline/extended anchors and reserved controls remain barriers.
                protected = control.code != 10 and control.code != 24 and control.code != 30 and control.code != 31;
            },
        }
        try spans.append(a, .{ .start = begin, .end = units, .source_start = source_start, .source_end = source_end, .protected = protected });
    }
    if (!ended or raw.len < 2) return error.UnsupportedParagraphTerminator;
    const owned_text = try text.toOwnedSlice(a);
    errdefer a.free(owned_text);
    const owned_raw = try a.dupe(u8, raw);
    errdefer a.free(owned_raw);
    return .{ .raw = owned_raw, .text = owned_text, .spans = try spans.toOwnedSlice(a), .source_units = @intCast(raw.len / 2 - 1) };
}

pub const PreparedEdits = struct {
    arena: std.heap.ArenaAllocator,
    edits: []const @import("../../model/independent_text_edits.zig").Edit,
    pub fn deinit(self: *PreparedEdits) void {
        self.arena.deinit();
        self.* = undefined;
    }
};

const Cursor = @import("../../text/utf8_utf16_splice.zig").Cursor;

/// Validate expected text on the search axis, then own the actual raw expected
/// slices on the source axis. Simple controls may have different visible text.
/// The source policy and History admission remain the caller's responsibility.
/// The cursor and ranges advance monotonically; no per-edit whole-text scans.
pub fn sourceEdits(a: std.mem.Allocator, projection: Projection, edits: []const @import("../../model/independent_text_edits.zig").Edit) !PreparedEdits {
    const Edit = @import("../../model/independent_text_edits.zig").Edit;
    const search_units = try @import("../../model/independent_text_edits.zig").utf16Units(projection.text);
    _ = try @import("../../model/independent_text_edits.zig").validate(edits, search_units, .{});
    var arena = std.heap.ArenaAllocator.init(a);
    errdefer arena.deinit();
    const owned = arena.allocator();
    const result = try owned.alloc(Edit, edits.len);
    var span_index: usize = 0;
    var cursor: Cursor = .{ .text = projection.text };
    var changed: usize = 0;
    for (edits) |edit| {
        const expected = edit.expected orelse return error.ExpectedTextRequired;
        const first = try cursor.seek(edit.start);
        const last = try cursor.seek(edit.end);
        if (!std.mem.eql(u8, projection.text[first..last], expected)) return error.ExpectedTextMismatch;
        // A visible identity replacement must preserve its underlying control
        // code; it is not a request to normalize raw HWP controls into Unicode.
        if (std.mem.eql(u8, expected, edit.text)) continue;
        while (span_index < projection.spans.len and projection.spans[span_index].end <= edit.start) span_index += 1;
        var index = span_index;
        var mapped_start: ?u32 = null;
        var mapped_end: ?u32 = null;
        while (index < projection.spans.len) : (index += 1) {
            const span = projection.spans[index];
            if (span.start >= edit.end and edit.start != edit.end) break;
            if (span.protected and edit.start < span.end and edit.end > span.start) return error.ProtectedTextRange;
            if (edit.start >= span.start and edit.start <= span.end and mapped_start == null)
                mapped_start = span.source_start + edit.start - span.start;
            if (edit.end >= span.start and edit.end <= span.end)
                mapped_end = span.source_start + edit.end - span.start;
            if (mapped_end != null) break;
        }
        if (edit.start == edit.end and edit.start == search_units) {
            mapped_start = projection.source_units;
            mapped_end = projection.source_units;
        }
        const start = mapped_start orelse return error.InvalidTextPosition;
        const end = mapped_end orelse return error.InvalidTextPosition;
        const raw = projection.raw[@as(usize, start) * 2 .. @as(usize, end) * 2];
        var bytes: std.ArrayList(u8) = .empty;
        defer bytes.deinit(owned);
        var offset: usize = 0;
        while (try @import("../../text/scalars.zig").read(raw, offset, .utf16le)) |scalar| {
            var encoded: [4]u8 = undefined;
            const n = try std.unicode.utf8Encode(scalar.value, &encoded);
            try bytes.appendSlice(owned, encoded[0..n]);
            offset = scalar.end;
        }
        result[changed] = .{ .start = start, .end = end, .text = try owned.dupe(u8, edit.text), .expected = try bytes.toOwnedSlice(owned) };
        changed += 1;
    }
    return .{ .arena = arena, .edits = result[0..changed] };
}

test "document text search excludes control payload and maps text after an extended anchor" {
    const a = std.testing.allocator;
    const raw = "a\x00\x09\x00hidden-data!\x09\x00b\x00\x0d\x00";
    var projection = try read(a, raw);
    defer projection.deinit(a);
    try std.testing.expectEqualStrings("a\tb", projection.text);
    var mapped = try sourceEdits(a, projection, &.{.{ .start = 2, .end = 3, .text = "B", .expected = "b" }});
    defer mapped.deinit();
    try std.testing.expectEqual(@as(u32, 9), mapped.edits[0].start);
    try std.testing.expectEqual(@as(u32, 10), mapped.edits[0].end);
    try std.testing.expectError(error.ProtectedTextRange, sourceEdits(a, projection, &.{.{ .start = 0, .end = 3, .text = "X", .expected = "a\tb" }}));
}

fn checkExpectedMapping(a: std.mem.Allocator) !void {
    var projection = try read(a, "a\x00\x18\x00\x1e\x00\x1f\x00\x3d\xd8\x00\xde\x0d\x00");
    defer projection.deinit(a);
    try std.testing.expectEqualStrings("a\xc2\xad\xc2\xa0\xc2\xa0😀", projection.text);
    var mapped = try sourceEdits(a, projection, &.{
        .{ .start = 1, .end = 4, .text = "X", .expected = "\xc2\xad\xc2\xa0\xc2\xa0" },
        .{ .start = 4, .end = 6, .text = "", .expected = "😀" },
    });
    defer mapped.deinit();
    // The Native source comparison must use original control codes, not their
    // visible Unicode forms. Replacement/expected bytes are request-owned here.
    try std.testing.expectEqualStrings("\x18\x1e\x1f", mapped.edits[0].expected.?);
    try std.testing.expectEqualStrings("😀", mapped.edits[1].expected.?);
    projection.raw[2] = 0;
    projection.text[1] = 0;
    try std.testing.expectEqualStrings("\x18\x1e\x1f", mapped.edits[0].expected.?);
    try std.testing.expectEqualStrings("X", mapped.edits[0].text);
}

test "document text search compares projected expected text before owning raw source expectations" {
    const a = std.testing.allocator;
    try checkExpectedMapping(a);
    try std.testing.checkAllAllocationFailures(a, checkExpectedMapping, .{});
    var projection = try read(a, "\x3d\xd8\x00\xde\x0d\x00");
    defer projection.deinit(a);
    try std.testing.expectError(error.ExpectedTextRequired, sourceEdits(a, projection, &.{
        .{ .start = 0, .end = 2, .text = "X" },
    }));
    try std.testing.expectError(error.ExpectedTextMismatch, sourceEdits(a, projection, &.{
        .{ .start = 0, .end = 2, .text = "X", .expected = "😁" },
    }));
    try std.testing.expectError(error.SplitSurrogatePair, sourceEdits(a, projection, &.{
        .{ .start = 1, .end = 1, .text = "X", .expected = "" },
    }));
    var insertion = try sourceEdits(a, projection, &.{
        .{ .start = 2, .end = 2, .text = "X", .expected = "" },
    });
    defer insertion.deinit();
    try std.testing.expectEqual(@as(u32, 2), insertion.edits[0].start);
    try std.testing.expectEqualStrings("", insertion.edits[0].expected.?);
}
