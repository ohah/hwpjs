//! Differential tests against the frozen 50455a8b4 scalar parser, plus explicit
//! semantic anchors. No dependency on the candidate helper's scan predicate.
const std = @import("std");
const t = std.testing;
const attr = @import("attribute_value.zig");
const old = @import("../testing/xml_attribute_parse_reference.zig");
const Input = @import("input.zig").Input;
const Encoding = @import("input.zig").Encoding;
const Cursor = @import("token_cursor.zig").Cursor;
const references = @import("references.zig");

const Case = struct {
    encoding: Encoding = .utf8,
    offset: usize = 0,
    start: usize = 0,
    token_bytes: usize = 4096,
    characters: usize = 4096,
    refs: usize = 8,
    options: references.Options = .{},
};

fn cursorFor(bytes: []const u8, c: Case) !Cursor {
    var input = try Input.init(bytes, c.encoding, .{ .max_bytes = bytes.len, .max_characters = c.characters });
    input.offset = c.offset;
    return .{ .input = input, .start = c.start, .max_bytes = c.token_bytes };
}

fn equalCursor(a: Cursor, b: Cursor) !void {
    try t.expectEqual(@intFromPtr(a.input.bytes.ptr), @intFromPtr(b.input.bytes.ptr));
    try t.expectEqual(a.input.bytes.len, b.input.bytes.len);
    try t.expectEqual(a.input.encoding, b.input.encoding);
    try t.expectEqual(a.input.offset, b.input.offset);
    try t.expectEqual(a.input.remaining, b.input.remaining);
    try t.expectEqual(a.start, b.start);
    try t.expectEqual(a.max_bytes, b.max_bytes);
}

// Compare a bounded normalized UTF-8 result at exact and insufficient output
// budgets. Parsing and decoding are separate: unresolved entities parse but
// deliberately cannot produce a complete UTF-8 value.
fn equalUtf8(a: attr.Value, b: attr.Value, limit: usize) !void {
    const expected = b.toUtf8(t.allocator, limit);
    if (a.toUtf8(t.allocator, limit)) |actual| {
        defer t.allocator.free(actual);
        const wanted = try expected;
        defer t.allocator.free(wanted);
        try t.expectEqualSlices(u8, wanted, actual);
    } else |err| {
        if (expected) |wanted| {
            defer t.allocator.free(wanted);
            return error.CandidateRejectedNormalizedValue;
        } else |wanted_err| try t.expectEqual(wanted_err, err);
    }
}

fn differential(bytes: []const u8, c: Case) !void {
    errdefer std.debug.print("attribute differential bytes={any} case={any}\n", .{ bytes, c });
    var actual = try cursorFor(bytes, c);
    var expected = actual;
    const before = actual;
    var actual_refs = c.refs;
    var expected_refs = c.refs;
    const baseline = old.parse(&expected, c.options, &expected_refs);
    if (attr.parse(&actual, c.options, &actual_refs)) |value| {
        const reference = try baseline;
        try equalCursor(expected, actual);
        try t.expectEqual(expected_refs, actual_refs);
        try t.expectEqualDeep(reference.stats, value.stats);
        try t.expectEqualDeep(reference.reference_options, value.reference_options);
        try t.expectEqual(reference.text.encoding, value.text.encoding);
        try t.expectEqualSlices(u8, reference.raw, value.raw);
        try t.expectEqualSlices(u8, reference.text.raw, value.text.raw);
        try t.expectEqual(@intFromPtr(reference.raw.ptr), @intFromPtr(value.raw.ptr));
        try t.expectEqual(@intFromPtr(reference.text.raw.ptr), @intFromPtr(value.text.raw.ptr));
        const borrowed = reference.borrowedNormalizedUtf8();
        if (value.borrowedNormalizedUtf8()) |raw| {
            try t.expectEqualSlices(u8, borrowed orelse return error.UnexpectedBorrowedValue, raw);
            try t.expectEqual(@intFromPtr(borrowed.?.ptr), @intFromPtr(raw.ptr));
        } else try t.expect(borrowed == null);
        try equalUtf8(value, reference, 4096);
        try equalUtf8(value, reference, 0);
        if (reference.toUtf8(t.allocator, 4096)) |normalized| {
            defer t.allocator.free(normalized);
            try equalUtf8(value, reference, normalized.len);
            if (normalized.len != 0) try equalUtf8(value, reference, normalized.len - 1);
        } else |err| try t.expectEqual(error.UnresolvedXmlEntity, err);
    } else |err| {
        if (baseline) |_| return error.CandidateRejectedBaselineSuccess else |wanted| try t.expectEqual(wanted, err);
        try equalCursor(before, expected);
        try equalCursor(before, actual);
        try t.expectEqual(c.refs, actual_refs);
        try t.expectEqual(c.refs, expected_refs);
        // Repeated failure must preserve both the cause and original state.
        try t.expectError(err, attr.parse(&actual, c.options, &actual_refs));
        try equalCursor(before, actual);
        try t.expectEqual(c.refs, actual_refs);
    }
}

fn failure(bytes: []const u8, c: Case, expected: anyerror) !void {
    try differential(bytes, c);
    var cursor = try cursorFor(bytes, c);
    var remaining = c.refs;
    try t.expectError(expected, attr.parse(&cursor, c.options, &remaining));
}

fn success(bytes: []const u8, c: Case, normalized: []const u8, stats: attr.Stats, end: usize, remaining_chars: usize) !void {
    try differential(bytes, c);
    var cursor = try cursorFor(bytes, c);
    var remaining = c.refs;
    const value = try attr.parse(&cursor, c.options, &remaining);
    try t.expectEqualDeep(stats, value.stats);
    try t.expectEqual(end, cursor.input.offset);
    try t.expectEqual(remaining_chars, cursor.input.remaining);
    try t.expectEqual(c.refs - stats.references, remaining);
    const decoded = try value.toUtf8(t.allocator, 4096);
    defer t.allocator.free(decoded);
    try t.expectEqualSlices(u8, normalized, decoded);
}

test "attribute ASCII differential every byte both quotes after bounded prefixes" {
    // Includes every invalid XML control, UTF-8 lead and continuation byte,
    // both delimiters and the opposite quote. Closing quotes may leave a tail.
    for ([_]u8{ '\'', '"' }) |quote| {
        for ([_]usize{ 0, 1, 15, 64, 129 }) |prefix| {
            for (0..256) |byte| {
                var buffer: [140]u8 = undefined;
                buffer[0] = quote;
                @memset(buffer[1 .. 1 + prefix], 'a');
                buffer[prefix + 1] = @intCast(byte);
                buffer[prefix + 2] = quote;
                const bytes = buffer[0 .. prefix + 3];
                try differential(bytes, .{});
                try differential(bytes, .{ .token_bytes = prefix + 2 });
                try differential(bytes, .{ .characters = prefix + 1 });
                try differential(bytes, .{ .refs = 0 });
            }
        }
    }
}

test "attribute ASCII differential Unicode malformed UTF8 truncations and budgets" {
    const contents = [_][]const u8{
        "",                                 "ordinary",         "\t\n",       "\r",           "\r\n",     "\r\r\n",
        "한글é😀",
        "\u{85}\u{2028}\u{feff}\u{10ffff}", "\x80",             "\xc0\x80",   "\xc2",         "\xe0\xa0", "\xed\xa0\x80",
        "\xf0\x90\x80",                     "\xf4\x90\x80\x80", "\xff",       "\xef\xbf\xbe", "\x00",     "&amp;",
        "&#13;",                            "&#x1F600;",        "&custom;",   "&",            "&amp",     "&#;",
        "&#x;",                             "&#0;",             "&#x110000;", "<",
    };
    for ([_]u8{ '\'', '"' }) |quote| {
        for (contents) |content| {
            var buffer: [256]u8 = undefined;
            buffer[0] = quote;
            @memset(buffer[1..18], 'p');
            @memcpy(buffer[18 .. 18 + content.len], content);
            buffer[18 + content.len] = quote;
            const bytes = buffer[0 .. 19 + content.len];
            for (0..bytes.len + 1) |cut| try differential(bytes[0..cut], .{});
            for (0..bytes.len + 2) |limit| {
                try differential(bytes, .{ .token_bytes = limit });
                try differential(bytes, .{ .characters = limit });
            }
        }
    }
}

test "attribute ASCII normalization and stats have fixed semantic anchors" {
    try success("'abc'\x00", .{ .characters = 5, .token_bytes = 5 }, "abc", .{ .scalars = 3 }, 5, 0);
    try success("\"a'b\"", .{ .characters = 5 }, "a'b", .{ .scalars = 3 }, 5, 0);
    try success("'\t\n\r\n\r'", .{ .characters = 6 }, "    ", .{ .scalars = 4 }, 7, 0);
    const source = "'p\t\r\n&#9;&#10;&#13;&lt;&gt;&amp;&quot;&apos;'";
    try success(source, .{ .characters = source.len }, "p  \t\n\r<>&\"'", .{ .scalars = 11, .references = 8 }, source.len, 1);
    try success("'한😀'", .{ .characters = 4 }, "한😀", .{ .scalars = 2 }, 9, 0);
    var cursor = try cursorFor("'pre&custom;post'", .{});
    var remaining: usize = 1;
    const value = try attr.parse(&cursor, .{}, &remaining);
    try t.expectEqualDeep(attr.Stats{ .scalars = 7, .references = 1, .unresolved = 1 }, value.stats);
    try t.expectEqual(@as(usize, 0), remaining);
    try t.expect(value.borrowedNormalizedUtf8() == null);
    try t.expectError(error.UnresolvedXmlEntity, value.toUtf8(t.allocator, 4096));
}

test "attribute ASCII top peek preserves error precedence and quote byte boundary" {
    try failure("", .{}, error.UnexpectedEnd);
    try failure("x", .{}, error.InvalidXmlAttributeValue);
    try failure("'abc'", .{ .token_bytes = 4 }, error.LimitExceeded);
    try failure("'abc'", .{ .characters = 4 }, error.LimitExceeded);
    try failure("'abc", .{ .characters = 4, .token_bytes = 4 }, error.UnexpectedEnd);
    // Encoding/XML validity is checked before exhausted character/token budgets.
    try failure("'abc\xff'", .{ .characters = 4, .token_bytes = 4 }, error.InvalidXmlEncoding);
    try failure("'abc\x01'", .{ .characters = 4, .token_bytes = 4 }, error.InvalidXmlCharacter);
    try failure("'abc<'", .{ .characters = 4 }, error.LimitExceeded);
    try failure("'abc<'", .{}, error.InvalidXmlAttributeValue);
    try failure("'abc&'", .{ .refs = 0 }, error.LimitExceeded);
    try failure("'abc&'", .{}, error.InvalidXmlName);
    try failure("'abc\xc2", .{ .characters = 4 }, error.UnexpectedEnd);
    try failure("'a&amp;bc<'", .{ .refs = 1 }, error.InvalidXmlAttributeValue);
}

test "attribute ASCII reference byte name shared count and character budgets" {
    for ([_][]const u8{
        "'aa&amp;bb&#13;cc'", "'&custom;&other;'", "'&quot;&apos;&lt;&gt;&amp;'", "'&#9;&#10;&#13;'",
        "'&#xD800;'",         "'&#x110000;'",      "'&name-with-dash;'",          "'&a b;'",
        "'&amp'",
    }) |bytes| {
        for (0..6) |refs| {
            try differential(bytes, .{ .refs = refs });
            for (0..10) |limit| {
                try differential(bytes, .{ .refs = refs, .options = .{ .max_bytes = limit } });
                try differential(bytes, .{ .refs = refs, .options = .{ .max_name_bytes = limit } });
            }
        }
    }
    try failure("'&amp;'", .{ .options = .{ .max_bytes = 4 } }, error.LimitExceeded);
    try failure("'&amp;'", .{ .options = .{ .max_name_bytes = 2 } }, error.LimitExceeded);
    try success("'&amp;'", .{ .characters = 7, .refs = 1, .options = .{ .max_bytes = 5, .max_name_bytes = 3 } }, "&", .{ .scalars = 1, .references = 1 }, 7, 0);
}

test "attribute ASCII bounded mixed runs resume after slow parts" {
    const parts = [_][]const u8{ "abc", "\t\n", "\r\n", "한😀", "&amp;", "&#13;", "&custom;", "\xff", "<" };
    for ([_]u8{ '\'', '"' }) |quote| {
        for (parts) |left| {
            for (parts) |right| {
                var buffer: [128]u8 = undefined;
                buffer[0] = quote;
                var end: usize = 1;
                for ([_][]const u8{ "prefix", left, "middle", right, "suffix" }) |part| {
                    @memcpy(buffer[end .. end + part.len], part);
                    end += part.len;
                }
                buffer[end] = quote;
                end += 1;
                const bytes = buffer[0..end];
                try differential(bytes, .{});
                try differential(bytes, .{ .refs = 1 });
                try differential(bytes, .{ .token_bytes = end - 1 });
                try differential(bytes, .{ .characters = end - 1 });
            }
        }
    }
}

test "attribute ASCII nonzero cursor token start rollback and sequential shared budget" {
    const bytes = "xx'abcdefgh&amp;'tail";
    for ([_]usize{ 0, 1, 2, 3 }) |start| {
        for (0..bytes.len + 1) |limit| try differential(bytes, .{ .offset = 2, .start = start, .token_bytes = limit });
    }
    try success(bytes, .{ .offset = 2, .start = 0, .token_bytes = 17, .characters = 15, .refs = 1 }, "abcdefgh&", .{ .scalars = 9, .references = 1 }, 17, 0);
    var cursor = try cursorFor("'a&amp;'\"b&amp;\"", .{});
    var remaining: usize = 1;
    _ = try attr.parse(&cursor, .{}, &remaining);
    const before = cursor;
    try t.expectError(error.LimitExceeded, attr.parse(&cursor, .{}, &remaining));
    try equalCursor(before, cursor);
    try t.expectEqual(@as(usize, 0), remaining);
    remaining = 1;
    const second = try attr.parse(&cursor, .{}, &remaining);
    try t.expectEqualDeep(attr.Stats{ .scalars = 2, .references = 1 }, second.stats);
}

fn encodedUnits(buffer: []u8, units: []const u16, encoding: Encoding) []const u8 {
    for (units, 0..) |unit, i| std.mem.writeInt(u16, buffer[i * 2 ..][0..2], unit, if (encoding == .utf16le) .little else .big);
    return buffer[0 .. units.len * 2];
}

test "attribute ASCII UTF16 both endian surrogate controls quote and budget matrix" {
    for ([_]Encoding{ .utf16le, .utf16be }) |encoding| {
        for ([_]u16{ '\'', '"' }) |quote| {
            for (0..256) |byte| {
                const units = [_]u16{ quote, 'a', 'b', @intCast(byte), quote };
                var buffer: [10]u8 = undefined;
                const bytes = encodedUnits(&buffer, &units, encoding);
                try differential(bytes, .{ .encoding = encoding });
                try differential(bytes, .{ .encoding = encoding, .token_bytes = 9 });
                try differential(bytes, .{ .encoding = encoding, .characters = 4 });
            }
            for ([_][]const u16{
                &.{ 'a', 0xd83d, 0xde00, 'z' }, &.{0xd800},                    &.{0xdc00}, &.{ 0xd800, 'a' },
                &.{ 0xd800, 0xd800 },           &.{0xfffe},                    &.{0xffff}, &.{ '\r', '\n', '\t', '\n' },
                &.{ '&', '#', '1', '3', ';' },  &.{ '&', 'a', 'm', 'p', ';' },
            }) |body| {
                var units: [64]u16 = undefined;
                units[0] = quote;
                units[1] = 'p';
                @memcpy(units[2 .. 2 + body.len], body);
                units[2 + body.len] = quote;
                var buffer: [128]u8 = undefined;
                const bytes = encodedUnits(&buffer, units[0 .. body.len + 3], encoding);
                for (0..bytes.len + 1) |cut| try differential(bytes[0..cut], .{ .encoding = encoding });
                for (0..bytes.len + 2) |limit| {
                    try differential(bytes, .{ .encoding = encoding, .token_bytes = limit });
                    try differential(bytes, .{ .encoding = encoding, .characters = limit });
                }
            }
        }
        var buffer: [12]u8 = undefined;
        const bytes = encodedUnits(&buffer, &.{ '\'', 'a', 0xd83d, 0xde00, '\'' }, encoding);
        try success(bytes, .{ .encoding = encoding, .characters = 4, .token_bytes = 10 }, "a😀", .{ .scalars = 2 }, 10, 0);
        try failure(bytes, .{ .encoding = encoding, .token_bytes = 9 }, error.LimitExceeded);
    }
}
