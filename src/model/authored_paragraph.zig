//! One authored paragraph owner, shared by both generated-table adapters.
//! Text is owned once. Inherit is a lazy run map using the parent default;
//! explicit runs are complete UTF-16 boundaries, not a second text model.
const std = @import("std");
const edits = @import("character_run_edit.zig");
pub const Run = @import("document.zig").CharacterRun;
pub const Styles = union(enum) { inherit, runs: []Run };
pub const Span = struct { start_unit: u32, end_unit: u32, char_shape_id: u32, text: []const u8 };
pub const SpanIterator = struct {
    text: []const u8,
    rows: []const Run,
    units: u32,
    index: usize = 0,
    unit: u32 = 0,
    offset: usize = 0,
    pub fn next(self: *SpanIterator) !?Span {
        if (self.index == self.rows.len) return null;
        const row = self.rows[self.index];
        const end = if (self.index + 1 < self.rows.len) self.rows[self.index + 1].start_unit else self.units;
        const begin = self.offset;
        while (self.unit < end) {
            const scalar = (try @import("../text/scalars.zig").read(self.text, self.offset, .utf8)) orelse return error.InvalidTextPosition;
            self.unit = try std.math.add(u32, self.unit, if (scalar.value > 0xffff) 2 else 1);
            self.offset = scalar.end;
        }
        if (self.unit != end) return error.SplitSurrogatePair;
        self.index += 1;
        return .{ .start_unit = row.start_unit, .end_unit = end, .char_shape_id = row.char_shape_id, .text = self.text[begin..self.offset] };
    }
};

pub const Paragraph = struct {
    paragraph_id: u32,
    text: []u8,
    styles: Styles = .inherit,

    pub fn deinit(self: *Paragraph, a: std.mem.Allocator) void {
        a.free(self.text);
        if (self.styles == .runs) a.free(self.styles.runs);
        self.* = undefined;
    }
    pub fn clone(self: *const Paragraph, a: std.mem.Allocator) !Paragraph {
        const text = try a.dupe(u8, self.text);
        errdefer a.free(text);
        return .{ .paragraph_id = self.paragraph_id, .text = text, .styles = if (self.styles == .runs) .{ .runs = try a.dupe(Run, self.styles.runs) } else .inherit };
    }
    pub fn dynamicBytes(self: *const Paragraph) !usize {
        const run_bytes = if (self.styles == .runs) try std.math.mul(usize, self.styles.runs.len, @sizeOf(Run)) else 0;
        return std.math.add(usize, self.text.len, run_bytes);
    }
    pub fn runs(self: *const Paragraph, fallback: u32, scratch: *[1]Run) []const Run {
        if (self.styles == .runs) return self.styles.runs;
        scratch.* = .{.{ .start_unit = 0, .char_shape_id = fallback }};
        return scratch;
    }

    /// O(text bytes + runs). A run cannot split a surrogate pair; no per-run
    /// rescans or resource-index assumptions are made here.
    pub fn validate(self: *const Paragraph, fallback: u32) !u32 {
        if (self.paragraph_id == 0) return error.InvalidTableParagraphIds;
        var scratch: [1]Run = undefined;
        const rows = self.runs(fallback, &scratch);
        if (rows.len == 0 or rows.len > 65535 or rows[0].start_unit != 0) return error.InvalidCharacterRuns;
        for (rows[1..], 1..) |row, i| if (row.start_unit <= rows[i - 1].start_unit) return error.InvalidCharacterRuns;
        var iterator = (std.unicode.Utf8View.init(self.text) catch return error.InvalidUnicodeEncoding).iterator();
        var unit: u32 = 0;
        var index: usize = 1;
        while (iterator.nextCodepoint()) |point| {
            const next = try std.math.add(u32, unit, if (point > 0xffff) 2 else 1);
            if (index < rows.len and rows[index].start_unit > unit and rows[index].start_unit < next) return error.SplitSurrogatePair;
            unit = next;
            if (index < rows.len and rows[index].start_unit == unit) index += 1;
        }
        if (index != rows.len) return error.InvalidCharacterRuns;
        return unit;
    }
    pub fn typingResourceId(self: *const Paragraph, fallback: u32, start: u32, end: u32, affinity: edits.InsertionAffinity) !u32 {
        const units = try self.validate(fallback);
        if (start > end or end > units) return error.InvalidTextPosition;
        _ = try @import("../text/utf8_utf16_splice.zig").byteOffset(self.text, start);
        _ = try @import("../text/utf8_utf16_splice.zig").byteOffset(self.text, end);
        var scratch: [1]Run = undefined;
        return edits.insertionResource(self.runs(fallback, &scratch), units, start, end, affinity);
    }
    /// Caller scratch must outlive the iterator. Validate once, then walk the
    /// UTF8 bytes exactly once across every run, including an explicit EOF run.
    pub fn spans(self: *const Paragraph, fallback: u32, scratch: *[1]Run) !SpanIterator {
        return .{ .text = self.text, .rows = self.runs(fallback, scratch), .units = try self.validate(fallback) };
    }

    /// Caller resolves the inserted resource through the existing document
    /// resource owner. All preparation is detached; no fallible work after swap.
    pub fn splice(self: *Paragraph, a: std.mem.Allocator, fallback: u32, start: u32, end: u32, inserted: []const u8, inserted_resource: ?u32, max_bytes: usize) !bool {
        _ = try self.validate(fallback);
        const text = try @import("../text/utf8_utf16_splice.zig").replace(a, self.text, start, end, inserted, max_bytes);
        errdefer a.free(text);
        const units = std.unicode.calcUtf16LeLen(inserted) catch return error.InvalidUnicodeEncoding;
        const added = std.math.cast(u32, units) orelse return error.LimitExceeded;
        _ = try std.math.add(u32, start, added);
        var scratch: [1]Run = undefined;
        const before = self.runs(fallback, &scratch);
        const after = try edits.replace(a, before, start, end, added, inserted_resource);
        errdefer a.free(after);
        var same = before.len == after.len;
        if (same) for (before, after) |left, right| {
            if (!std.meta.eql(left, right)) {
                same = false;
                break;
            }
        };
        if (same and std.mem.eql(u8, self.text, text)) {
            a.free(text);
            a.free(after);
            return false;
        }
        var candidate: Paragraph = .{ .paragraph_id = self.paragraph_id, .text = text, .styles = .{ .runs = after } };
        _ = try candidate.validate(fallback);
        const inherit = after.len == 1 and after[0].char_shape_id == fallback;
        const bytes = if (inherit) text.len else try candidate.dynamicBytes();
        if (bytes > max_bytes) return error.LimitExceeded;
        if (inherit) {
            a.free(after);
            candidate.styles = .inherit;
        }
        std.mem.swap(Paragraph, self, &candidate);
        candidate.deinit(a);
        return true;
    }
    pub fn replaceAll(self: *Paragraph, a: std.mem.Allocator, fallback: u32, text: []const u8, max_bytes: usize) !bool {
        const units = try self.validate(fallback);
        if (std.mem.eql(u8, self.text, text)) return false;
        return self.splice(a, fallback, 0, units, text, null, max_bytes);
    }
};

test "generated cell rich model rich splice keeps exact Unicode boundaries and surrounding styles" {
    const a = std.testing.allocator;
    var p: Paragraph = .{ .paragraph_id = 7, .text = try a.dupe(u8, "A😀B") };
    defer p.deinit(a);
    try std.testing.expect(try p.splice(a, 3, 1, 3, "한😀", 9, 1000));
    try std.testing.expectEqualStrings("A한😀B", p.text);
    var scratch: [1]Run = undefined;
    try std.testing.expectEqualDeep(@as([]const Run, &.{ .{ .start_unit = 0, .char_shape_id = 3 }, .{ .start_unit = 1, .char_shape_id = 9 }, .{ .start_unit = 4, .char_shape_id = 3 } }), p.runs(3, &scratch));
    try std.testing.expectEqual(@as(u32, 9), try p.typingResourceId(3, 4, 4, .preceding_visible));
    try std.testing.expectEqual(@as(u32, 3), try p.typingResourceId(3, 4, 4, .at_start));
    try std.testing.expectEqual(@as(u32, 9), try p.typingResourceId(3, 1, 4, .preceding_visible));
    try std.testing.expectError(error.SplitSurrogatePair, p.splice(a, 3, 3, 3, "x", 4, 1000));
    try std.testing.expectEqualStrings("A한😀B", p.text);
    var copy = try p.clone(a);
    defer copy.deinit(a);
    try std.testing.expectEqualDeep(p, copy);
    try std.testing.expect(try copy.replaceAll(a, 3, "whole", 1000));
    try std.testing.expectEqualStrings("A한😀B", p.text);
}

test "generated cell rich model insertion at zero EOF and deletion preserve the resource map" {
    const a = std.testing.allocator;
    var p: Paragraph = .{ .paragraph_id = 1, .text = &.{} };
    defer p.deinit(a);
    try std.testing.expect(try p.splice(a, 0, 0, 0, "😀", 7, 1000));
    try std.testing.expectEqual(@as(u32, 7), try p.typingResourceId(0, 2, 2, .at_start));
    try std.testing.expect(try p.splice(a, 0, 2, 2, "한", 7, 1000));
    try std.testing.expect(try p.splice(a, 0, 0, 3, "", null, 1000));
    try std.testing.expectEqualStrings("", p.text);
    try std.testing.expectEqual(@as(u32, 0), try p.validate(0));
}

test "generated cell rich model clone and rich splice leave no partial ownership on allocation failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var p: Paragraph = .{ .paragraph_id = 1, .text = try a.dupe(u8, "A😀B") };
            defer p.deinit(a);
            const changed = try p.splice(a, 0, 1, 3, "한😀", 7, 1000);
            try std.testing.expect(changed);
            var copy = try p.clone(a);
            defer copy.deinit(a);
            try std.testing.expectEqualDeep(p, copy);
        }
    }.run, .{});
}
