const Input = @import("input.zig").Input;
const Cursor = @import("tag_cursor.zig").Cursor;
const references = @import("references.zig");
pub const Part = union(enum) {
    literal: u21,
    reference: references.Reference,
    pub fn scalar(self: Part) ?u21 {
        return switch (self) {
            .literal => |c| c,
            .reference => |r| switch (r.value) {
                .numeric, .predefined => |c| c,
                .unresolved => null,
            },
        };
    }
};
pub const Stats = struct { scalars: usize = 0, references: usize = 0, unresolved: usize = 0 };
pub const Value = struct {
    raw: []const u8, // Includes both quotes; preserves original whitespace/references.
    text: @import("text.zig").View,
    stats: Stats,
    reference_options: references.Options,
    pub fn iterator(self: Value) !Iterator {
        const input = try Input.init(self.text.raw, self.text.encoding, .{ .max_bytes = self.text.raw.len, .max_characters = self.text.raw.len });
        return .{ .cursor = .{ .input = input, .start = 0, .max_bytes = self.text.raw.len }, .options = self.reference_options };
    }
};
pub const Iterator = struct {
    cursor: Cursor,
    options: references.Options,
    pub fn next(self: *Iterator) !?Part {
        var cursor = self.cursor;
        const part = try nextPart(&cursor, self.options);
        self.cursor = cursor;
        return part;
    }
};
fn nextPart(cursor: *Cursor, options: references.Options) !?Part {
    const c = (try cursor.peek()) orelse return null;
    if (c == '<') return error.InvalidXmlAttributeValue;
    if (c == '&') return .{ .reference = try cursor.reference(options) };
    _ = try cursor.next();
    return .{ .literal = if (@import("characters.zig").whitespace(c)) 32 else c };
}
/// CDATA-style lexical normalization only. Unknown entities remain unresolved.
/// Commits cursor and the shared reference count only after the closing quote.
pub fn parse(cursor: *Cursor, options: references.Options, remaining_references: *usize) !Value {
    var local = cursor.*;
    var remaining = remaining_references.*;
    const start = local.input.offset;
    const quote = (try local.next()) orelse return error.UnexpectedEnd;
    if (quote != '\'' and quote != '"') return error.InvalidXmlAttributeValue;
    const content_start = local.input.offset;
    var stats: Stats = .{};
    while (true) {
        const c = (try local.peek()) orelse return error.UnexpectedEnd;
        if (c == quote) {
            const end = local.input.offset;
            _ = try local.next();
            const value: Value = .{ .raw = local.input.bytes[start..local.input.offset], .text = .{ .raw = local.input.bytes[content_start..end], .encoding = local.input.encoding }, .stats = stats, .reference_options = options };
            cursor.* = local;
            remaining_references.* = remaining;
            return value;
        }
        if (c == '&' and remaining == 0) return error.LimitExceeded;
        const part = (try nextPart(&local, options)).?;
        if (part == .reference) {
            stats.references += 1;
            remaining -= 1;
        }
        if (part.scalar() != null) stats.scalars += 1 else stats.unresolved += 1;
    }
}
