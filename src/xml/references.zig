const Input = @import("input.zig").Input;
const names = @import("names.zig");
pub const Options = struct { max_bytes: usize = 4096, max_name_bytes: usize = 4096 };
pub const Reference = struct {
    raw: []const u8,
    value: union(enum) { numeric: u21, predefined: u21, unresolved: names.Name },
};
fn take(cursor: *Input, start: usize, max_bytes: usize) !u21 {
    const c = (try cursor.next()) orelse return error.UnexpectedEnd;
    if (c.end - start > max_bytes) return error.LimitExceeded;
    return c.value;
}
/// Parses one reference including & and ;. Never resolves external/general entities.
/// Numeric CR is returned as CR, not sent through literal line normalization again.
pub fn parse(input: *Input, options: Options) !Reference {
    var cursor = input.*;
    const start = cursor.offset;
    if (try take(&cursor, start, options.max_bytes) != '&') return error.InvalidXmlReference;
    var look = cursor;
    const first = (try look.next()) orelse return error.UnexpectedEnd;
    var value: @FieldType(Reference, "value") = undefined;
    if (first.value == '#') {
        _ = try take(&cursor, start, options.max_bytes);
        look = cursor;
        const next = (try look.next()) orelse return error.UnexpectedEnd;
        const base: u32 = if (next.value == 'x') 16 else 10;
        if (base == 16) _ = try take(&cursor, start, options.max_bytes);
        var number: u32 = 0;
        var digits: usize = 0;
        while (true) {
            const c = try take(&cursor, start, options.max_bytes);
            if (c == ';') break;
            const digit: u32 = switch (c) {
                '0'...'9' => c - '0',
                'a'...'f' => c - 'a' + 10,
                'A'...'F' => c - 'A' + 10,
                else => return error.InvalidXmlReference,
            };
            if (digit >= base) return error.InvalidXmlReference;
            if (number > (0x10ffff - digit) / base) return error.XmlCharacterReferenceOutOfRange;
            number = number * base + digit;
            digits += 1;
        }
        if (digits == 0) return error.InvalidXmlReference;
        if (!@import("characters.zig").valid(number)) return error.InvalidXmlCharacter;
        value = .{ .numeric = @intCast(number) };
    } else {
        const name = try names.parse(&cursor, @min(options.max_name_bytes, options.max_bytes - (cursor.offset - start)));
        if (try take(&cursor, start, options.max_bytes) != ';') return error.InvalidXmlReference;
        value = .{ .unresolved = name };
        inline for (.{ .{ "lt", '<' }, .{ "gt", '>' }, .{ "amp", '&' }, .{ "apos", '\'' }, .{ "quot", '"' } }) |entry| {
            if (name.equals(entry[0], false)) value = .{ .predefined = entry[1] };
        }
    }
    const result: Reference = .{ .raw = input.bytes[start..cursor.offset], .value = value };
    input.* = cursor;
    return result;
}
