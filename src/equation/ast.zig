const std = @import("std");
const Token = @import("token.zig").Token;
pub const Pair = struct { top: usize, bottom: usize };
pub const IndexedRadical = struct { index: usize, body: usize };
pub const Row = struct { start: usize, len: usize };
pub const Grid = struct { kind: @import("grid_types.zig").Kind, rows: Row, closed: bool = true };
pub const Scripts = struct { base: usize, sub: ?usize = null, sup: ?usize = null, side: enum { left, right } = .right };
pub const Group = struct { delimiter: enum { braces, parentheses, brackets }, body: usize, closed: bool = true };
pub const Delimited = struct { left: ?Token, body: usize, right: ?Token };
pub const Decoration = struct { token: Token, body: usize };
pub const Command = struct { token: Token, family: @import("commands.zig").Family };
pub const Styled = struct { token: Token, change: @import("font.zig").Change, body: ?usize };
pub const Symbol = struct { token: Token, glyph: []const u8, role: @import("symbols.zig").Role, basis: @import("symbols.zig").Basis };
pub const Data = union(enum) { literal: Token, symbol: Symbol, function: Token, styled: Styled, decoration: Decoration, command: Command, unmatched_delimiter: Token, row: Row, grid: Grid, group: Group, delimited: Delimited, fraction: Pair, atop: Pair, radical: usize, indexed_radical: IndexedRadical, scripts: Scripts };
pub const Diagnostic = struct { kind: enum { missing_closing_brace, unexpected_closing_brace, unresolved_font_script_scope }, offset: usize };
pub const Node = struct { start: usize, end: usize, depth: usize, data: Data };
/// Flat owned arena; destruction never recurses through hostile expression trees.
pub const Tree = struct {
    allocator: std.mem.Allocator,
    source: []u8,
    nodes: []Node,
    children: []usize,
    diagnostics: []Diagnostic,
    root: usize,
    pub fn deinit(self: *Tree) void {
        self.allocator.free(self.children);
        self.allocator.free(self.diagnostics);
        self.allocator.free(self.nodes);
        self.allocator.free(self.source);
        self.* = undefined;
    }
};
