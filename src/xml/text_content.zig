const std = @import("std");
const input = @import("input.zig");
const references = @import("references.zig");

pub const Kind = enum { char_data, cdata };

/// Borrows one validated content run from the document visitor. The raw span
/// excludes CDATA delimiters; only CharData expands XML character references.
pub const View = struct {
    kind: Kind,
    raw: []const u8,
    encoding: input.Encoding,
    scalars: usize,
    reference_options: references.Options,

    pub fn toUtf8(self: View, a: std.mem.Allocator, max_bytes: usize) ![]u8 {
        var cursor = try input.Input.init(self.raw, self.encoding, .{ .max_bytes = self.raw.len, .max_characters = self.raw.len });
        var out: std.ArrayList(u8) = .empty;
        defer out.deinit(a);
        while (true) {
            var look = cursor;
            const first = (try look.next()) orelse break;
            const scalar: u21 = if (self.kind == .char_data and first.value == '&') blk: {
                const reference = try references.parse(&cursor, self.reference_options);
                break :blk switch (reference.value) {
                    .numeric, .predefined => |value| value,
                    .unresolved => return error.UnresolvedXmlEntity,
                };
            } else (try cursor.next()).?.value;
            var encoded: [4]u8 = undefined;
            const len = try std.unicode.utf8Encode(scalar, &encoded);
            if (out.items.len > max_bytes or len > max_bytes - out.items.len) return error.LimitExceeded;
            try out.appendSlice(a, encoded[0..len]);
        }
        return out.toOwnedSlice(a);
    }
};
