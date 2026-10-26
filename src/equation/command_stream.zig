//! Semantic word splitting layered on the unchanged raw lexical scanner.
const lexical = @import("lexer.zig");
const commands = @import("commands.zig");
const std = @import("std");
pub const Stream = struct {
    lexer: lexical.Lexer,
    pending_identifier_end: ?usize = null,
    pub fn init(source: []const u8, options: lexical.Options) !Stream {
        return .{ .lexer = try lexical.Lexer.init(source, options) };
    }
    pub fn next(self: *Stream) !lexical.Token {
        var candidate = self.lexer;
        var pending = self.pending_identifier_end;
        var token: lexical.Token = undefined;
        if (pending != null and candidate.offset < pending.? and std.ascii.isAlphabetic(candidate.source[candidate.offset])) {
            const source = candidate.source;
            const suffix = source[candidate.offset..pending.?];
            if (commands.prefixAsciiWord(suffix)) |head| {
                // 이전에 검사한 ASCII 단어는 다음 명령 길이까지만 다시 읽습니다.
                candidate.source = source[0 .. candidate.offset + head.consumed];
            }
            token = try candidate.next();
            candidate.source = source;
        } else token = try candidate.next();
        if (pending != null and token.end >= pending.?) pending = null;
        if (token.kind == .identifier) {
            if (commands.prefix(token.value)) |head| {
                if (head.consumed < token.value.len) {
                    pending = token.end;
                    token.end = token.start + head.consumed;
                    token.value = token.value[0..head.consumed];
                    // Re-lex the remainder (over20x -> over, 20, x). The raw
                    // scanner's count still bounds every emitted token.
                    candidate.offset = token.end;
                }
            }
        }
        self.lexer = candidate;
        self.pending_identifier_end = pending;
        return token;
    }
};
