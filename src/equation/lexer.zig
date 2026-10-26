//! Bounded allocation-free lexical scanning shared by HWP5/HWPX equations.
const std = @import("std");
const scalars = @import("../text/scalars.zig");
pub const Token = @import("token.zig").Token;
pub const Options = struct { max_bytes: usize = 1024 * 1024, max_tokens: usize = 1024 * 1024 };

fn gap(byte: u8) bool {
    return byte == ' ' or byte == '\t' or byte == '\r' or byte == '\n';
}

pub const Lexer = struct {
    source: []const u8,
    options: Options,
    offset: usize = 0,
    count: usize = 0,
    eof: ?Token = null,

    pub fn init(source: []const u8, options: Options) !Lexer {
        if (source.len > options.max_bytes) return error.EquationInputLimitExceeded;
        var cursor: usize = 0;
        while (try scalars.read(source, cursor, .utf8)) |scalar| cursor = scalar.end;
        return .{ .source = source, .options = options };
    }

    pub fn next(self: *Lexer) !Token {
        if (self.eof) |token| return token;
        var start = self.offset;
        while (start < self.source.len and gap(self.source[start])) start += 1;
        const spaced = start != self.offset;
        if (start == self.source.len) {
            const token: Token = .{ .kind = .eof, .start = start, .end = start, .value = self.source[start..], .space_before = spaced };
            self.offset = start;
            self.eof = token;
            return token;
        }
        if (self.count >= self.options.max_tokens) return error.EquationTokenLimitExceeded;
        var end = start + 1;
        var kind: @import("token.zig").Kind = .symbol;
        var value_start = start;
        var value_end: ?usize = null;
        const byte = self.source[start];
        switch (byte) {
            '{' => kind = .left_brace,
            '}' => kind = .right_brace,
            '(' => kind = .left_paren,
            ')' => kind = .right_paren,
            '[' => kind = .left_bracket,
            ']' => kind = .right_bracket,
            '_' => kind = .subscript,
            '^' => kind = .superscript,
            '~' => kind = .normal_space,
            '`' => kind = .thin_space,
            '#' => kind = .row_break,
            '&' => kind = .alignment,
            '"' => {
                kind = .quoted;
                value_start = end;
                end = std.mem.indexOfScalarPos(u8, self.source, end, '"') orelse return error.UnclosedEquationQuote;
                value_end = end;
                end += 1;
            },
            '0'...'9' => {
                kind = .number;
                while (end < self.source.len and std.ascii.isDigit(self.source[end])) end += 1;
                if (self.source.len - end > 1 and self.source[end] == '.' and std.ascii.isDigit(self.source[end + 1])) {
                    end += 2;
                    while (end < self.source.len and std.ascii.isDigit(self.source[end])) end += 1;
                }
            },
            'a'...'z', 'A'...'Z' => {
                kind = .identifier;
                while (end < self.source.len and std.ascii.isAlphanumeric(self.source[end])) end += 1;
            },
            0x80...0xff => {
                kind = .text;
                end = (try scalars.read(self.source, start, .utf8)).?.end;
                while (end < self.source.len and self.source[end] >= 0x80) end = (try scalars.read(self.source, end, .utf8)).?.end;
            },
            else => {
                for ([_][]const u8{ "<<<", ">>>", "<=", ">=", "!=", "==", "<<", ">>", "->" }) |symbol| {
                    if (std.mem.startsWith(u8, self.source[start..], symbol)) {
                        end = start + symbol.len;
                        break;
                    }
                }
            },
        }
        const token: Token = .{ .kind = kind, .start = start, .end = end, .value = self.source[value_start .. value_end orelse end], .space_before = spaced };
        self.offset = end;
        self.count += 1;
        return token;
    }
};
