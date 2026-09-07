const Input = @import("input.zig").Input;
const Cursor = @import("token_cursor.zig").Cursor;
pub const Kind = enum { tag, comment, cdata, pi, doctype };
fn begins(input: Input, prefix: []const u8) !bool {
    var copy = input;
    for (prefix) |c| {
        const found = (try copy.next()) orelse return false;
        if (found.value != c) return false;
    }
    return true;
}
pub fn classify(input: Input) !Kind {
    if (try begins(input, "<!--")) return .comment;
    if (try begins(input, "<![CDATA[")) return .cdata;
    if (try begins(input, "<?")) return .pi;
    if (try begins(input, "<!DOCTYPE")) return .doctype;
    if (try begins(input, "<!")) return error.InvalidXmlMarkup;
    return .tag;
}
fn literal(cursor: *Cursor, expected: []const u8) !void {
    for (expected) |c| {
        const found = (try cursor.next()) orelse return error.UnexpectedEnd;
        if (found != c) return error.InvalidXmlMarkup;
    }
}
/// Comment/CDATA/PI validation only; never interpret references or execute PI data.
/// Returns content scalar count (used for CDATA); caller state is atomic on error.
pub fn parse(input: *Input, kind: Kind, max_bytes: usize, max_name_bytes: usize) !usize {
    var cursor: Cursor = .{ .input = input.*, .start = input.offset, .max_bytes = max_bytes };
    switch (kind) {
        .comment => try literal(&cursor, "<!--"),
        .cdata => try literal(&cursor, "<![CDATA["),
        .pi => {
            try literal(&cursor, "<?");
            const target = try cursor.name(max_name_bytes);
            if (target.equals("xml", true)) return error.ReservedXmlPiTarget;
            if ((try cursor.peek()) == '?') {
                try literal(&cursor, "?>");
                input.* = cursor.input;
                return 0;
            }
            if (!try cursor.whitespace()) return error.InvalidXmlMarkup;
        },
        .doctype => return error.UnsupportedXmlDtd,
        .tag => return error.InvalidXmlMarkup,
    }
    var count: usize = 0;
    var tail: usize = 0;
    while (true) {
        const c = (try cursor.next()) orelse return error.UnexpectedEnd;
        count += 1;
        if (kind == .comment) {
            if (c == '-' and tail == 1) {
                try literal(&cursor, ">");
                count -= 2;
                break;
            }
            tail = if (c == '-') 1 else 0;
        } else if (kind == .cdata) {
            if (c == '>' and tail == 2) {
                count -= 3;
                break;
            }
            tail = if (c == ']') @min(tail + 1, 2) else 0;
        } else {
            if (c == '>' and tail == 1) {
                count -= 2;
                break;
            }
            tail = if (c == '?') 1 else 0;
        }
    }
    input.* = cursor.input;
    return count;
}
