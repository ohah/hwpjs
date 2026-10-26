//! Structural equation parsing. Command expansion and layout are separate.
const std = @import("std");
const ast = @import("ast.zig");
const lexical = @import("lexer.zig");
const Token = lexical.Token;
const Kind = @import("token.zig").Kind;
const commands = @import("commands.zig");
const Stream = @import("command_stream.zig").Stream;
pub const Options = struct {
    lexical: lexical.Options = .{},
    max_nodes: usize = 65536,
    max_edges: usize = 65536,
    max_depth: usize = 64,
    delimiter_policy: enum { strict, preserve_with_diagnostics } = .strict,
    max_diagnostics: usize = 1024,
    max_scan_steps: usize = 4 * 1024 * 1024,
};

const Parser = struct {
    a: std.mem.Allocator,
    options: Options,
    lexer: Stream,
    current: Token,
    nodes: std.ArrayList(ast.Node) = .empty,
    children: std.ArrayList(usize) = .empty,
    diagnostics: std.ArrayList(ast.Diagnostic) = .empty,
    grid_operand_boundary: bool = false,
    right_operand_boundary: bool = false,
    scan_steps: usize = 0,
    implicit_stop: ?usize = null,

    fn diagnose(self: *Parser, diagnostic: ast.Diagnostic) !void {
        if (self.diagnostics.items.len >= self.options.max_diagnostics) return error.EquationDiagnosticLimitExceeded;
        try self.diagnostics.append(self.a, diagnostic);
    }

    fn advance(self: *Parser) !void {
        self.current = try self.lexer.next();
    }
    fn command(self: *const Parser, family: commands.Family) bool {
        if (self.current.kind != .identifier) return false;
        const value = commands.lookup(self.current.value) orelse return false;
        return value.family == family;
    }
    fn depth(self: *const Parser, index: usize) usize {
        return self.nodes.items[index].depth;
    }
    fn add(self: *Parser, start: usize, end: usize, data: ast.Data) !usize {
        if (self.nodes.items.len >= self.options.max_nodes) return error.EquationNodeLimitExceeded;
        var child_depth: usize = 0;
        switch (data) {
            .literal, .symbol, .function, .command, .unmatched_delimiter => {},
            .styled => |styled| if (styled.body) |body| {
                child_depth = self.depth(body);
            },
            .group => |group| child_depth = self.depth(group.body),
            .delimited => |pair| child_depth = self.depth(pair.body),
            .decoration => |value| child_depth = self.depth(value.body),
            .radical => |body| child_depth = self.depth(body),
            .indexed_radical => |root| child_depth = @max(self.depth(root.index), self.depth(root.body)),
            .fraction, .atop => |pair| child_depth = @max(self.depth(pair.top), self.depth(pair.bottom)),
            .scripts => |scripts| {
                child_depth = self.depth(scripts.base);
                if (scripts.sub) |sub| child_depth = @max(child_depth, self.depth(sub));
                if (scripts.sup) |sup| child_depth = @max(child_depth, self.depth(sup));
            },
            .row => |range| for (self.children.items[range.start..][0..range.len]) |child| {
                child_depth = @max(child_depth, self.depth(child));
            },
            .grid => |grid_value| for (self.children.items[grid_value.rows.start..][0..grid_value.rows.len]) |child| {
                child_depth = @max(child_depth, self.depth(child));
            },
        }
        if (child_depth >= self.options.max_depth) return error.EquationDepthLimitExceeded;
        const index = self.nodes.items.len;
        try self.nodes.append(self.a, .{ .start = start, .end = end, .depth = child_depth + 1, .data = data });
        return index;
    }
    fn guard(self: *const Parser, level: usize) !void {
        if (level >= self.options.max_depth) return error.EquationDepthLimitExceeded;
    }
    fn row(self: *Parser, stop: Kind, level: usize) anyerror!usize {
        return self.rowBoundary(stop, level, false);
    }
    fn appendChildren(self: *Parser, children: []const usize) !ast.Row {
        if (children.len > self.options.max_edges -| self.children.items.len) return error.EquationEdgeLimitExceeded;
        const range: ast.Row = .{ .start = self.children.items.len, .len = children.len };
        try self.children.appendSlice(self.a, children);
        return range;
    }
    fn grid(self: *Parser, token: Token, kind: @FieldType(ast.Grid, "kind"), level: usize) anyerror!usize {
        try self.guard(level);
        if (self.current.kind != .left_brace) return error.MissingEquationGridGroup;
        const opening = self.current;
        try self.advance();
        var rows: std.ArrayList(usize) = .empty;
        defer rows.deinit(self.a);
        var cells: std.ArrayList(usize) = .empty;
        defer cells.deinit(self.a);
        while (true) {
            const start = self.current.start;
            while (true) {
                if (cells.items.len >= self.options.max_edges) return error.EquationEdgeLimitExceeded;
                try cells.append(self.a, try self.rowBoundary(.right_brace, level + 1, true));
                if (self.current.kind != .alignment) break;
                try self.advance();
            }
            if (rows.items.len >= self.options.max_edges) return error.EquationEdgeLimitExceeded;
            const row_node = try self.add(start, self.current.start, .{ .row = try self.appendChildren(cells.items) });
            try rows.append(self.a, row_node);
            cells.clearRetainingCapacity();
            if (self.current.kind != .row_break) break;
            try self.advance();
        }
        const closed = self.current.kind == .right_brace;
        const end = self.current.end;
        if (closed) try self.advance() else try self.diagnose(.{ .kind = .missing_closing_brace, .offset = opening.start });
        return self.add(token.start, end, .{ .grid = .{ .kind = kind, .rows = try self.appendChildren(rows.items), .closed = closed } });
    }
    fn rowBoundary(self: *Parser, stop: Kind, level: usize, grid_cell: bool) anyerror!usize {
        return self.rowUntil(stop, level, grid_cell, false);
    }
    fn rowUntil(self: *Parser, stop: Kind, level: usize, grid_cell: bool, stop_right: bool) anyerror!usize {
        try self.guard(level);
        const previous_boundary = self.grid_operand_boundary;
        const previous_right = self.right_operand_boundary;
        self.grid_operand_boundary = grid_cell;
        self.right_operand_boundary = stop_right;
        defer self.grid_operand_boundary = previous_boundary;
        defer self.right_operand_boundary = previous_right;
        const start = self.current.start;
        var children: std.ArrayList(usize) = .empty;
        defer children.deinit(self.a);
        while (self.current.kind != stop) {
            if (self.implicit_stop == self.current.start) break;
            if (stop_right and self.command(.right_delimiter)) break;
            if (grid_cell and (self.current.kind == .alignment or self.current.kind == .row_break)) break;
            if (self.current.kind == .eof) {
                if (self.options.delimiter_policy == .strict) return error.UnclosedEquationGroup;
                break;
            }
            if (self.current.kind == .right_brace) {
                if (self.options.delimiter_policy == .strict) return error.UnexpectedEquationDelimiter;
                if (children.items.len >= self.options.max_edges) return error.EquationEdgeLimitExceeded;
                const token = self.current;
                try self.diagnose(.{ .kind = .unexpected_closing_brace, .offset = token.start });
                try self.advance();
                try children.append(self.a, try self.add(token.start, token.end, .{ .unmatched_delimiter = token }));
                continue;
            }
            if (!stop_right and !grid_cell and stop == .eof and level == 0 and children.items.len > 0 and self.command(.right_delimiter)) {
                var probe = self.lexer;
                const candidate = try self.scanNext(&probe);
                var unmatched_command = false;
                if (@import("delimiter_tokens.zig").isDelimiter(candidate.value)) for (children.items) |child| {
                    if (self.scan_steps >= self.options.max_scan_steps) return error.EquationDelimiterScanLimitExceeded;
                    self.scan_steps += 1;
                    const data = self.nodes.items[child].data;
                    if (data == .command and (data.command.family == .left_delimiter or data.command.family == .right_delimiter)) {
                        unmatched_command = true;
                        break;
                    }
                };
                if (!unmatched_command and @import("delimiter_tokens.zig").isDelimiter(candidate.value)) {
                    const body_end = self.current.start;
                    try self.advance();
                    const right = try self.extendDelimiter(self.current, &self.lexer);
                    try self.advance();
                    const body = try self.add(start, body_end, .{ .row = try self.appendChildren(children.items) });
                    children.clearRetainingCapacity();
                    const fragment = try self.add(start, right.end, .{ .delimited = .{ .left = null, .body = body, .right = right } });
                    try children.append(self.a, try self.postfix(fragment, level));
                    continue;
                }
            }
            if (self.command(.fraction) or self.command(.atop)) {
                if (children.items.len == 0) return error.MissingEquationOperand;
                const atop = self.command(.atop);
                try self.advance();
                const bottom = try self.element(level + 1);
                const top = children.items[children.items.len - 1];
                const pair: ast.Pair = .{ .top = top, .bottom = bottom };
                children.items[children.items.len - 1] = try self.add(self.nodes.items[top].start, self.nodes.items[bottom].end, if (atop) .{ .atop = pair } else .{ .fraction = pair });
            } else {
                // Bound transient row storage as well as the final child arena.
                if (children.items.len >= self.options.max_edges) return error.EquationEdgeLimitExceeded;
                try children.append(self.a, try self.element(level));
            }
        }
        const range = try self.appendChildren(children.items);
        return self.add(start, self.current.start, .{ .row = range });
    }
    fn primary(self: *Parser, level: usize) anyerror!usize {
        try self.guard(level);
        if (self.command(.left_script)) return error.MissingEquationOperand;
        const token = self.current;
        if (self.implicit_stop == token.start) return error.MissingEquationOperand;
        if (self.grid_operand_boundary and (token.kind == .alignment or token.kind == .row_break)) return error.MissingEquationOperand;
        if (self.right_operand_boundary and self.command(.right_delimiter)) return error.MissingEquationOperand;
        switch (token.kind) {
            .eof, .subscript, .superscript, .right_brace => return error.MissingEquationOperand,
            .left_brace => {
                try self.advance();
                const body = try self.row(.right_brace, level + 1);
                const end = self.current.end;
                const closed = self.current.kind == .right_brace;
                if (closed) try self.advance() else try self.diagnose(.{ .kind = .missing_closing_brace, .offset = token.start });
                return self.add(token.start, end, .{ .group = .{ .delimiter = .braces, .body = body, .closed = closed } });
            },
            else => {
                if (self.command(.left_delimiter) and try self.hasRightDelimiter()) {
                    try self.advance();
                    const left = try self.extendDelimiter(self.current, &self.lexer);
                    try self.advance();
                    const body = try self.rowUntil(.eof, level + 1, self.grid_operand_boundary, true);
                    if (!self.command(.right_delimiter)) return error.MissingEquationRightDelimiter;
                    try self.advance();
                    const right = try self.extendDelimiter(self.current, &self.lexer);
                    if (!@import("delimiter_tokens.zig").isDelimiter(right.value)) return error.InvalidEquationDelimiter;
                    try self.advance();
                    return self.add(token.start, right.end, .{ .delimited = .{ .left = left, .body = body, .right = right } });
                }
                if (self.command(.left_delimiter)) {
                    if (try self.bareClosingDelimiter()) |closing| {
                        try self.advance();
                        const left = self.current;
                        try self.advance();
                        const previous_stop = self.implicit_stop;
                        self.implicit_stop = closing.start;
                        const body = self.rowUntil(.eof, level + 1, self.grid_operand_boundary, false) catch |err| {
                            self.implicit_stop = previous_stop;
                            return err;
                        };
                        self.implicit_stop = previous_stop;
                        if (self.current.start != closing.start) return error.MissingEquationRightDelimiter;
                        const right = self.current;
                        try self.advance();
                        return self.add(token.start, right.end, .{ .delimited = .{ .left = left, .body = body, .right = right } });
                    }
                    var probe = self.lexer;
                    const opening = try self.scanNext(&probe);
                    if (@import("delimiter_tokens.zig").isDelimiter(opening.value)) {
                        _ = try self.extendDelimiter(opening, &probe);
                        const operand = try self.scanNext(&probe);
                        const classified = if (operand.kind == .identifier) commands.lookup(operand.value) else null;
                        if (classified != null and classified.?.family == .pile) {
                            try self.advance();
                            const left = try self.extendDelimiter(self.current, &self.lexer);
                            try self.advance();
                            const body = try self.element(level + 1);
                            return self.add(token.start, self.nodes.items[body].end, .{ .delimited = .{ .left = left, .body = body, .right = null } });
                        }
                    }
                }
                if (self.command(.ladder) or self.command(.matrix) or self.command(.pile) or self.command(.cases) or self.command(.alignment)) {
                    const resolved = commands.lookup(token.value) orelse return error.InvalidEquationGridKind;
                    const kind = std.meta.stringToEnum(@FieldType(ast.Grid, "kind"), resolved.canonical) orelse return error.InvalidEquationGridKind;
                    try self.advance();
                    return self.grid(token, kind, level + 1);
                }
                if (self.command(.fraction) or self.command(.atop) or self.command(.superscript) or self.command(.subscript)) return error.MissingEquationOperand;
                if (self.command(.decoration)) {
                    try self.advance();
                    // Keep dangling commands explicit. Never steal a row/cell,
                    // fraction, script, or paired-delimiter boundary as an operand.
                    const boundary = switch (self.current.kind) {
                        .eof, .right_brace, .subscript, .superscript, .row_break, .alignment, .normal_space, .thin_space => true,
                        else => self.command(.fraction) or self.command(.atop) or self.command(.superscript) or self.command(.subscript) or self.command(.right_delimiter),
                    };
                    if (boundary) return self.add(token.start, token.end, .{ .command = .{ .token = token, .family = .decoration } });
                    const body = try self.primary(level + 1);
                    return self.add(token.start, self.nodes.items[body].end, .{ .decoration = .{ .token = token, .body = body } });
                }
                if (self.command(.roman) or self.command(.italic) or self.command(.bold)) {
                    const change: @import("font.zig").Change = if (self.command(.roman)) .roman else if (self.command(.italic)) .italic else .bold;
                    try self.advance();
                    var body: ?usize = null;
                    const next_command = if (self.current.kind == .identifier) commands.lookup(self.current.value) else null;
                    const blocked = if (next_command) |command_value| commands.blocksFontOperand(command_value.family) else false;
                    const script_ahead = self.current.kind == .subscript or self.current.kind == .superscript or self.command(.subscript) or self.command(.superscript);
                    if (script_ahead) {
                        // Preserve this scope boundary explicitly. Resolving it
                        // against a preceding term requires a later context pass.
                        try self.diagnose(.{ .kind = .unresolved_font_script_scope, .offset = token.start });
                    } else if (self.current.kind != .eof and self.current.kind != .right_brace and !blocked and !(self.grid_operand_boundary and (self.current.kind == .alignment or self.current.kind == .row_break))) body = try self.primary(level + 1);
                    return self.add(token.start, if (body) |index| self.nodes.items[index].end else token.end, .{ .styled = .{ .token = token, .change = change, .body = body } });
                }
                if (self.command(.square_root) or self.command(.root)) {
                    try self.advance();
                    const body = try self.element(level + 1);
                    if (self.current.kind == .identifier and std.ascii.eqlIgnoreCase(self.current.value, "of")) {
                        try self.advance();
                        const radicand = try self.element(level + 1);
                        return self.add(token.start, self.nodes.items[radicand].end, .{ .indexed_radical = .{ .index = body, .body = radicand } });
                    }
                    return self.add(token.start, self.nodes.items[body].end, .{ .radical = body });
                }
                try self.advance();
                if (token.kind == .identifier or token.kind == .symbol) {
                    if (@import("symbols.zig").lookup(token.value)) |entry| return self.add(token.start, token.end, .{ .symbol = .{ .token = token, .glyph = entry.glyph, .role = entry.role, .basis = entry.basis } });
                }
                if (token.kind == .identifier) {
                    if (commands.lookup(token.value)) |resolved| {
                        if (resolved.family == .function) return self.add(token.start, token.end, .{ .function = token });
                        return self.add(token.start, token.end, .{ .command = .{ .token = token, .family = resolved.family } });
                    }
                }
                return self.add(token.start, token.end, .{ .literal = token });
            },
        }
    }
    fn element(self: *Parser, level: usize) anyerror!usize {
        const base = try self.primary(level);
        return self.postfix(base, level);
    }
    fn postfix(self: *Parser, base: usize, level: usize) anyerror!usize {
        var scripts: ast.Scripts = .{ .base = base };
        var end = self.nodes.items[base].end;
        while (self.current.kind == .subscript or self.current.kind == .superscript or self.command(.superscript) or self.command(.subscript) or self.command(.left_script)) {
            const left = self.command(.left_script);
            const side: @FieldType(ast.Scripts, "side") = if (left) .left else .right;
            const sub = if (left) std.mem.eql(u8, commands.lookup(self.current.value).?.canonical, "lsub") else self.current.kind == .subscript or self.command(.subscript);
            if ((scripts.sub != null or scripts.sup != null) and scripts.side != side) {
                const current = try self.add(self.nodes.items[scripts.base].start, end, .{ .scripts = scripts });
                scripts = .{ .base = current };
            }
            scripts.side = side;
            if (if (sub) scripts.sub != null else scripts.sup != null) return error.DuplicateEquationScript;
            try self.advance();
            const value = try self.primary(level + 1);
            if (sub) scripts.sub = value else scripts.sup = value;
            end = self.nodes.items[value].end;
        }
        if (scripts.sub == null and scripts.sup == null) return base;
        return self.add(self.nodes.items[scripts.base].start, end, .{ .scripts = scripts });
    }
    fn scanNext(self: *Parser, stream: *Stream) !Token {
        if (self.scan_steps >= self.options.max_scan_steps) return error.EquationDelimiterScanLimitExceeded;
        self.scan_steps += 1;
        return stream.next();
    }
    fn extendDelimiter(self: *Parser, initial: Token, stream: *Stream) !Token {
        if (!std.mem.eql(u8, initial.value, "|")) return initial;
        var probe = stream.*;
        const next = try self.scanNext(&probe);
        if (next.start != initial.end or !std.mem.eql(u8, next.value, "|")) return initial;
        stream.* = probe;
        var token = initial;
        token.end = next.end;
        token.value = initial.value.ptr[0..2];
        return token;
    }
    fn scanDelimiter(self: *Parser, stream: *Stream) !Token {
        const token = try self.scanNext(stream);
        return self.extendDelimiter(token, stream);
    }
    // Probe without consuming: dangling commands keep their original explicit
    // unsupported nodes. Bound all probes together, including hostile repeats.
    fn hasRightDelimiter(self: *Parser) !bool {
        var stream = self.lexer;
        const opening = try self.scanDelimiter(&stream);
        if (!@import("delimiter_tokens.zig").isDelimiter(opening.value)) return false;
        var nesting: usize = 1;
        var braces: usize = 0;
        while (true) {
            const token = try self.scanNext(&stream);
            if (self.implicit_stop == token.start) return false;
            if (token.kind == .eof) return false;
            if (token.kind == .left_brace) braces += 1;
            if (token.kind == .right_brace) {
                if (braces == 0) return false;
                braces -= 1;
            }
            if (self.grid_operand_boundary and braces == 0 and nesting == 1 and (token.kind == .alignment or token.kind == .row_break)) return false;
            if (token.kind != .identifier) continue;
            const resolved = commands.lookup(token.value) orelse continue;
            if (resolved.family == .left_delimiter) {
                nesting += 1;
                if (!@import("delimiter_tokens.zig").isDelimiter((try self.scanDelimiter(&stream)).value)) return false;
            }
            if (resolved.family == .right_delimiter) {
                nesting -= 1;
                const closing = try self.scanDelimiter(&stream);
                if (!@import("delimiter_tokens.zig").isDelimiter(closing.value)) return false;
                if (nesting == 0) return braces == 0;
            }
        }
    }

    // Only actual balanced parentheses/brackets qualify. Structural braces and
    // grid cells retain their own ownership; no closing token is synthesized.
    fn bareClosingDelimiter(self: *Parser) !?Token {
        var stream = self.lexer;
        const opening = try self.scanNext(&stream);
        if (opening.kind == .quoted) return null;
        if (!std.mem.eql(u8, opening.value, "(") and !std.mem.eql(u8, opening.value, "[")) return null;
        var stack: [64]u8 = undefined;
        stack[0] = opening.value[0];
        var count: usize = 1;
        var braces: usize = 0;
        while (true) {
            const token = try self.scanNext(&stream);
            if (token.kind == .eof or self.implicit_stop == token.start) return null;
            if (self.grid_operand_boundary and braces == 0 and (token.kind == .alignment or token.kind == .row_break)) return null;
            if (token.kind == .identifier) if (commands.lookup(token.value)) |resolved| {
                if (resolved.family == .left_delimiter or resolved.family == .right_delimiter) return null;
            };
            // Quoted text is one token and must never become a delimiter.
            if (token.value.len != 1 or token.kind == .quoted) continue;
            const ch = token.value[0];
            if (ch == '(' or ch == '[' or ch == '{') {
                if (ch == '{') braces += 1;
                if (count == stack.len) return error.EquationDepthLimitExceeded;
                stack[count] = ch;
                count += 1;
            } else if (ch == ')' or ch == ']' or ch == '}') {
                const expected: u8 = switch (stack[count - 1]) {
                    '(' => ')',
                    '[' => ']',
                    else => '}',
                };
                if (ch != expected) return null;
                if (ch == '}') braces -= 1;
                count -= 1;
                if (count == 0) return token;
            }
        }
    }
};

pub fn parse(a: std.mem.Allocator, input: []const u8, options: Options) !ast.Tree {
    if (options.max_depth > 64) return error.InvalidEquationDepthLimit;
    _ = try lexical.Lexer.init(input, options.lexical);
    const source = try a.dupe(u8, input);
    errdefer a.free(source);
    const lexer = try Stream.init(source, options.lexical);
    var parser: Parser = .{ .a = a, .options = options, .lexer = lexer, .current = undefined };
    // Fetch from the parser's own lexer so no token is replayed.
    parser.current = try parser.lexer.next();
    defer parser.nodes.deinit(a);
    defer parser.children.deinit(a);
    defer parser.diagnostics.deinit(a);
    const root = try parser.row(.eof, 0);
    const nodes = try parser.nodes.toOwnedSlice(a);
    errdefer a.free(nodes);
    const children = try parser.children.toOwnedSlice(a);
    errdefer a.free(children);
    const diagnostics = try parser.diagnostics.toOwnedSlice(a);
    return .{ .allocator = a, .source = source, .nodes = nodes, .children = children, .diagnostics = diagnostics, .root = root };
}
