//! Lexical categories, not equation command recognition or a renderable AST.
pub const Kind = enum {
    eof,
    identifier,
    number,
    text,
    quoted,
    symbol,
    left_brace,
    right_brace,
    left_paren,
    right_paren,
    left_bracket,
    right_bracket,
    subscript,
    superscript,
    normal_space,
    thin_space,
    row_break,
    alignment,
};

pub const Token = struct {
    kind: Kind,
    start: usize,
    end: usize,
    /// Borrowed original bytes; quoted tokens exclude only the delimiters.
    value: []const u8,
    space_before: bool,
};
