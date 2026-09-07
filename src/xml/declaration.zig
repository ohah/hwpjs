const Input = @import("input.zig").Input;
pub const Value = @import("text.zig").View;
pub const Declaration = struct { raw: []const u8, version: Value, encoding: ?Value, standalone: ?bool };
fn space(c: u21) bool {
    return c == 32 or c == 9 or c == 10 or c == 13;
}
const Cursor = struct {
    input: Input,
    start: usize,
    max_bytes: usize,
    fn next(self: *Cursor) !?u21 {
        var candidate = self.input;
        const c = (try candidate.next()) orelse return null;
        if (c.end - self.start > self.max_bytes) return error.LimitExceeded;
        self.input = candidate;
        return c.value;
    }
    fn peek(self: Cursor) !?u21 {
        var copy = self;
        return copy.next();
    }
    fn literal(self: *Cursor, text: []const u8) !void {
        for (text) |c| {
            const found = (try self.next()) orelse return error.UnexpectedEnd;
            if (found != c) return error.InvalidXmlDeclaration;
        }
    }
    fn whitespace(self: *Cursor) !bool {
        var any = false;
        while (try self.peek()) |c| {
            if (!space(c)) break;
            _ = try self.next();
            any = true;
        }
        return any;
    }
    fn value(self: *Cursor, kind: enum { version, encoding, standalone }) !Value {
        _ = try self.whitespace();
        try self.literal("=");
        _ = try self.whitespace();
        const quote = (try self.next()) orelse return error.UnexpectedEnd;
        if (quote != '\'' and quote != '"') return error.InvalidXmlDeclaration;
        const start = self.input.offset;
        var count: usize = 0;
        while (true) {
            const end = self.input.offset;
            const c = (try self.next()) orelse return error.UnexpectedEnd;
            if (c == quote) {
                if (count == 0 or (kind == .version and count < 3)) return error.InvalidXmlDeclaration;
                return .{ .raw = self.input.bytes[start..end], .encoding = self.input.encoding };
            }
            const valid = switch (kind) {
                .version => if (count == 0) c == '1' else if (count == 1) c == '.' else c >= '0' and c <= '9',
                .encoding => (c >= 'A' and c <= 'Z') or (c >= 'a' and c <= 'z') or (count != 0 and ((c >= '0' and c <= '9') or c == '.' or c == '_' or c == '-')),
                .standalone => c >= 'a' and c <= 'z',
            };
            if (!valid) return error.InvalidXmlDeclaration;
            count += 1;
        }
    }
};
/// Parse XMLDecl only, not external TextDecl or general PI syntax. Caller positions
/// input just after the encoding signature. Null/error leaves all input state intact.
/// Version 1.x is preserved and processed with XML 1.0 rules, not silently XML 1.1.
pub fn parse(input: *Input, max_bytes: usize) !?Declaration {
    var look = input.*;
    for ("<?xml") |c| {
        const found = (try look.next()) orelse return null;
        if (found.value != c) return null;
    }
    const boundary = (try look.next()) orelse return error.UnexpectedEnd;
    if (!space(boundary.value)) return null; // xml-stylesheet etc. are PI responsibility.
    var cursor: Cursor = .{ .input = input.*, .start = input.offset, .max_bytes = max_bytes };
    try cursor.literal("<?xml");
    _ = try cursor.whitespace();
    try cursor.literal("version");
    const version = try cursor.value(.version);
    var encoding: ?Value = null;
    var standalone: ?bool = null;
    while (true) {
        const separated = try cursor.whitespace();
        const c = (try cursor.peek()) orelse return error.UnexpectedEnd;
        if (c == '?') {
            try cursor.literal("?>");
            const result: Declaration = .{ .raw = input.bytes[input.offset..cursor.input.offset], .version = version, .encoding = encoding, .standalone = standalone };
            input.* = cursor.input;
            return result;
        }
        if (!separated) return error.InvalidXmlDeclaration;
        if (c == 'e' and encoding == null and standalone == null) {
            try cursor.literal("encoding");
            encoding = try cursor.value(.encoding);
        } else if (c == 's' and standalone == null) {
            try cursor.literal("standalone");
            const value = try cursor.value(.standalone);
            standalone = if (value.equals("yes", false)) true else if (value.equals("no", false)) false else return error.InvalidXmlDeclaration;
        } else return error.InvalidXmlDeclaration;
    }
}
