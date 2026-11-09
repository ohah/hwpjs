//! Frozen scalar parser preimage: commit 50455a8b42b766a4229057619ed63b59dc229cf6.
//! Source: src/xml/attribute_value.zig; Git blob 595db3c6a435908b0b68c90d0e03662d2ec1e834.
//! Full source SHA256: 5cee86d2bcf4d51d800295fefb131d76d42d98610305dabc45e869f6030da591
//! nextPart and parse below are copied from that blob; only the relative
//! characters.zig import is relocated. Shared types and
//! unchanged Input/reference decoder retain the old scalar path, without the
//! candidate ASCII helper or candidate parse. Never refresh from the worktree.
const Cursor = @import("../xml/token_cursor.zig").Cursor;
const references = @import("../xml/references.zig");
const Part = @import("../xml/attribute_value.zig").Part;
const Stats = @import("../xml/attribute_value.zig").Stats;
const Value = @import("../xml/attribute_value.zig").Value;

fn nextPart(cursor: *Cursor, options: references.Options) !?Part {
    const c = (try cursor.peek()) orelse return null;
    if (c == '<') return error.InvalidXmlAttributeValue;
    if (c == '&') return .{ .reference = try cursor.reference(options) };
    _ = try cursor.next();
    return .{ .literal = if (@import("../xml/characters.zig").whitespace(c)) 32 else c };
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
