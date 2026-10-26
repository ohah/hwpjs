const std = @import("std");
const t = std.testing;
const Lexer = @import("lexer.zig").Lexer;
const Kind = @import("token.zig").Kind;

test "equation lexer retains source spans whitespace quoted text and Unicode" {
    const source = " \t{앞😀 + 12.50} over20 \"quoted # &\"\r\n_ ^ ~ ` # &";
    var lexer = try Lexer.init(source, .{});
    const kinds = [_]Kind{ .left_brace, .text, .symbol, .number, .right_brace, .identifier, .quoted, .subscript, .superscript, .normal_space, .thin_space, .row_break, .alignment };
    const values = [_][]const u8{ "{", "앞😀", "+", "12.50", "}", "over20", "quoted # &", "_", "^", "~", "`", "#", "&" };
    var previous: usize = 0;
    for (kinds, values) |kind, value| {
        const token = try lexer.next();
        try t.expectEqual(kind, token.kind);
        try t.expectEqualStrings(value, token.value);
        try t.expect(token.start >= previous and token.end > token.start);
        try t.expectEqual(token.start > previous, token.space_before);
        if (kind == .quoted) try t.expectEqualStrings("\"quoted # &\"", source[token.start..token.end]);
        previous = token.end;
    }
    const eof = try lexer.next();
    try t.expectEqual(Kind.eof, eof.kind);
    try t.expectEqualDeep(eof, try lexer.next());
    try t.expectEqual(source.len, lexer.offset);
}

test "equation lexer errors and exact budgets preserve state" {
    try t.expectError(error.EquationInputLimitExceeded, Lexer.init("abc", .{ .max_bytes = 2 }));
    var lexer = try Lexer.init("a \"unterminated", .{ .max_bytes = 15 });
    _ = try lexer.next();
    const offset = lexer.offset;
    for (0..2) |_| try t.expectError(error.UnclosedEquationQuote, lexer.next());
    try t.expectEqual(offset, lexer.offset);
    try t.expectEqual(@as(usize, 1), lexer.count);
    var bounded = try Lexer.init("x y", .{ .max_tokens = 1 });
    _ = try bounded.next();
    for (0..2) |_| try t.expectError(error.EquationTokenLimitExceeded, bounded.next());
    try t.expectEqual(@as(usize, 1), bounded.offset);
    var empty = try Lexer.init(" \r\n", .{ .max_tokens = 0 });
    const eof = try empty.next();
    try t.expectEqual(Kind.eof, eof.kind);
    try t.expectEqualDeep(eof, try empty.next());
    var exact = try Lexer.init("a", .{ .max_bytes = 1, .max_tokens = 1 });
    _ = try exact.next();
    try t.expectEqual(Kind.eof, (try exact.next()).kind);
}

test "equation lexer never drops following delimiters and uses longest operator matches" {
    var lexer = try Lexer.init(")x]y}z <<< << <= < >>> >> >= > -> 1. 2.3.4", .{});
    const expected = [_][]const u8{ ")", "x", "]", "y", "}", "z", "<<<", "<<", "<=", "<", ">>>", ">>", ">=", ">", "->", "1", ".", "2.3", ".", "4" };
    for (expected) |value| try t.expectEqualStrings(value, (try lexer.next()).value);
    try t.expectEqual(Kind.eof, (try lexer.next()).kind);
}

test "equation lexer strict scalar input rejects malformed and truncated UTF8" {
    for ([_][]const u8{ "\x80", "\xc0\x80", "\xed\xa0\x80", "\xf4\x90\x80\x80" }) |source| try t.expectError(error.InvalidUnicodeEncoding, Lexer.init(source, .{}));
    const source = "한😀";
    for ([_]usize{ 1, 2, 4, 5, 6 }) |length| try t.expectError(error.UnexpectedEnd, Lexer.init(source[0..length], .{}));
    for (0..128) |byte| {
        const bytes = [_]u8{@intCast(byte)};
        var lexer = try Lexer.init(&bytes, .{});
        if (byte == '"') {
            try t.expectError(error.UnclosedEquationQuote, lexer.next());
        } else {
            _ = try lexer.next();
            try t.expectEqual(Kind.eof, (try lexer.next()).kind);
        }
    }
}

test "equation lexer scans current scripts from two actual HWPX fixtures" {
    const a = t.allocator;
    var scripts: usize = 0;
    for ([_][]const u8{ "legacy/rust/crates/hwp-core/tests/fixtures/latex.hwpx", "reference/rhwp/samples/수식-문자처럼취급-아님.hwpx" }) |path| {
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        var session = try @import("../hwpx/editor_session.zig").open(a, input, .{});
        defer session.deinit();
        var snapshot = try @import("../hwpx/equation_script_snapshot.zig").read(a, &session, 0, .{});
        defer snapshot.deinit();
        for (snapshot.rows) |row| {
            var lexer = try Lexer.init(row.value.?, .{});
            while ((try lexer.next()).kind != .eof) {}
            scripts += 1;
        }
    }
    try t.expectEqual(@as(usize, 21), scripts);
}
