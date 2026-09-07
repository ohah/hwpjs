const std = @import("std");
const Input = @import("input.zig").Input;
const Cursor = @import("tag_cursor.zig").Cursor;
const names = @import("names.zig");
const values = @import("attribute_value.zig");
pub const Attribute = struct { name: names.Name, value: values.Value };
pub const Options = struct {
    max_bytes: usize = 64 * 1024,
    max_name_bytes: usize = 4096,
    max_attributes: usize = 4096,
    max_references: usize = 65536,
    references: @import("references.zig").Options = .{},
};
pub const Tag = struct {
    kind: enum { start, end, empty },
    raw: []const u8,
    name: names.Name,
    attributes: []Attribute,
    references: usize,
    unresolved: usize,
    pub fn deinit(self: *Tag, a: std.mem.Allocator) void {
        a.free(self.attributes);
        self.* = undefined;
    }
};
/// One tag only. Owns attribute array; all strings borrow input. No element stack,
/// namespaces, DTD or general entity resolution. No partial result/cursor on error.
pub fn parse(a: std.mem.Allocator, input: *Input, options: Options) !Tag {
    var cursor: Cursor = .{ .input = input.*, .start = input.offset, .max_bytes = options.max_bytes };
    try cursor.require('<');
    const closing = (try cursor.peek()) == '/';
    if (closing) _ = try cursor.next();
    const name = try cursor.name(options.max_name_bytes);
    var attributes: std.ArrayList(Attribute) = .empty;
    defer attributes.deinit(a);
    var seen: std.StringHashMapUnmanaged(void) = .empty;
    defer seen.deinit(a);
    var remaining = options.max_references;
    var unresolved: usize = 0;
    var kind: @FieldType(Tag, "kind") = if (closing) .end else .start;
    while (true) {
        const separated = try cursor.whitespace();
        const c = (try cursor.peek()) orelse return error.UnexpectedEnd;
        if (c == '>') {
            _ = try cursor.next();
            break;
        }
        if (closing) return error.InvalidXmlTag;
        if (c == '/') {
            _ = try cursor.next();
            try cursor.require('>');
            kind = .empty;
            break;
        }
        if (!separated) return error.InvalidXmlTag;
        if (attributes.items.len == options.max_attributes) return error.LimitExceeded;
        const attr_name = try cursor.name(options.max_name_bytes);
        // Same strict encoding, no character references in names: byte equality
        // is codepoint equality. Namespace-expanded equality is a later check.
        if ((try seen.getOrPut(a, attr_name.raw)).found_existing) return error.DuplicateXmlAttribute;
        _ = try cursor.whitespace();
        try cursor.require('=');
        _ = try cursor.whitespace();
        const value = try values.parse(&cursor, options.references, &remaining);
        unresolved += value.stats.unresolved;
        try attributes.append(a, .{ .name = attr_name, .value = value });
    }
    const result: Tag = .{ .kind = kind, .raw = input.bytes[input.offset..cursor.input.offset], .name = name, .attributes = try attributes.toOwnedSlice(a), .references = options.max_references - remaining, .unresolved = unresolved };
    input.* = cursor.input;
    return result;
}
