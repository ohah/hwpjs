//! Detached read-only measurement requests, not layout results or edit state.
const std = @import("std");
const ast = @import("ast.zig");
const font = @import("font.zig");
const context = @import("script_context.zig");
const types = @import("measurement_types.zig");
pub const Options = struct {
    size: f64,
    script_scale: f64,
    fraction_scale: f64,
    max_size: f64 = 1_000_000,
    max_nodes: usize = 65536,
    max_requests: usize = 65536,
    max_blockers: usize = 65536,
    max_source_bytes: usize = 1024 * 1024,
    max_request_bytes: usize = 4 * 1024 * 1024,
    max_steps: usize = 4 * 1024 * 1024,
    accept_observed_symbols: bool = false,
    allow_unclosed_groups: bool = false,
};
const Builder = struct {
    a: std.mem.Allocator,
    tree: *const ast.Tree,
    source: []u8,
    options: Options,
    links: []const context.Link,
    by_script: []?usize,
    heads: []?usize,
    next: []?usize,
    seen: []bool,
    remaining: usize,
    bytes: usize = 0,
    recovered_open_groups: usize = 0,
    requests: std.ArrayList(types.Request) = .empty,
    blockers: std.ArrayList(types.Blocker) = .empty,

    fn size(self: *const Builder, value: f64) !void {
        if (!std.math.isFinite(value) or value <= 0) return error.InvalidEquationMeasurementSize;
        if (value > self.options.max_size) return error.EquationMeasurementLimitExceeded;
    }
    fn block(self: *Builder, node: ?usize, kind: @FieldType(types.Blocker, "kind")) !void {
        if (self.blockers.items.len >= self.options.max_blockers) return error.EquationMeasurementLimitExceeded;
        var blocker: types.Blocker = .{ .node = node, .kind = kind };
        if (node) |index| {
            if (index >= self.tree.nodes.len) return error.InvalidEquationTree;
            const value = self.tree.nodes[index];
            if (value.start > value.end or value.end > self.source.len) return error.InvalidEquationTree;
            blocker.source_start = value.start;
            blocker.source_end = value.end;
            if (value.data == .command) blocker.command_family = value.data.command.family;
            if (value.data == .decoration) {
                _ = try self.tokenText(value.data.decoration.token);
                blocker.command_family = .decoration;
                blocker.source_start = value.data.decoration.token.start;
                blocker.source_end = value.data.decoration.token.end;
            }
        }
        try self.blockers.append(self.a, blocker);
    }
    fn tokenText(self: *const Builder, token: @import("token.zig").Token) ![]const u8 {
        if (token.start > token.end or token.end > self.tree.source.len) return error.InvalidEquationTree;
        const offset = std.math.sub(usize, @intFromPtr(token.value.ptr), @intFromPtr(self.tree.source.ptr)) catch return error.InvalidEquationTree;
        if (offset < token.start or offset > token.end or token.value.len > token.end - offset) return error.InvalidEquationTree;
        return self.source[offset..][0..token.value.len];
    }
    fn request(self: *Builder, index: usize, token: @import("token.zig").Token, value: []const u8, point_size: f64, style: font.Style, role: @FieldType(types.Request, "role")) !void {
        _ = try self.tokenText(token);
        if (self.requests.items.len >= self.options.max_requests or value.len > self.options.max_request_bytes -| self.bytes) return error.EquationMeasurementLimitExceeded;
        try self.requests.append(self.a, .{ .node = index, .text = value, .source_start = token.start, .source_end = token.end, .size = point_size, .style = style, .role = role });
        self.bytes += value.len;
    }
    fn visit(self: *Builder, index: usize, parent: usize, point_size: f64, style: font.Style, depth: usize) anyerror!void {
        if (index >= self.tree.nodes.len or index >= parent or depth >= 64 or self.seen[index]) return error.InvalidEquationTree;
        if (self.remaining == 0) return error.EquationMeasurementLimitExceeded;
        self.remaining -= 1;
        try self.size(point_size);
        self.seen[index] = true;
        const node = self.tree.nodes[index];
        if (self.by_script[index]) |redirect| {
            if (self.links[redirect].retained_base) |base| try self.visit(base, index, point_size, style, depth + 1);
            return;
        }
        switch (node.data) {
            .literal => |token| switch (token.kind) {
                .identifier => {
                    if (!@import("identifier.zig").isOrdinaryTerm(token.value)) try self.block(index, .unresolved_identifier);
                    try self.request(index, token, try self.tokenText(token), point_size, style, .identifier);
                },
                .text => try self.request(index, token, try self.tokenText(token), point_size, style, .text),
                .number => try self.request(index, token, try self.tokenText(token), point_size, font.number(style), .number),
                .quoted => try self.request(index, token, try self.tokenText(token), point_size, font.number(style), .quoted),
                .normal_space, .thin_space => {},
                .row_break, .alignment => try self.block(index, .multiline),
                else => try self.request(index, token, try self.tokenText(token), point_size, font.function(), .symbol),
            },
            .symbol => |symbol| {
                if (symbol.basis == .observed_compatibility and !self.options.accept_observed_symbols) try self.block(index, .compatibility_symbol);
                try self.request(index, symbol.token, symbol.glyph, point_size, font.function(), .symbol);
            },
            .function => |token| {
                const command = @import("commands.zig").lookup(token.value) orelse return error.InvalidEquationTree;
                try self.request(index, token, command.canonical, point_size, font.function(), .function);
            },
            .styled => |styled| if (styled.body) |body| try self.visit(body, index, point_size, font.apply(style, styled.change), depth + 1),
            .decoration => |value| {
                _ = try self.tokenText(value.token);
                if (@import("decoration_geometry.zig").resolve(value.token.value) == null) try self.block(index, .unsupported_command);
                try self.visit(value.body, index, point_size, style, depth + 1);
            },
            .group => |group| {
                if (!group.closed) {
                    var diagnosed = false;
                    if (self.options.allow_unclosed_groups and group.delimiter == .braces and node.end == self.source.len) {
                        for (self.tree.diagnostics) |diagnostic| {
                            if (self.remaining == 0) return error.EquationMeasurementLimitExceeded;
                            self.remaining -= 1;
                            if (diagnostic.kind == .missing_closing_brace and diagnostic.offset == node.start) {
                                diagnosed = true;
                                break;
                            }
                        }
                    }
                    if (self.options.allow_unclosed_groups and diagnosed and group.delimiter == .braces and node.end == self.source.len) {
                        self.recovered_open_groups += 1;
                    } else try self.block(index, .unclosed_group);
                }
                try self.visit(group.body, index, point_size, style, depth + 1);
            },
            .delimited => |pair| {
                if (pair.left == null and pair.right == null) return error.InvalidEquationTree;
                for ([_]?@import("token.zig").Token{ pair.left, pair.right }) |side| if (side) |token| {
                    _ = try self.tokenText(token);
                    if (@import("delimiter_tokens.zig").resolve(token.value) == null) try self.block(index, .delimiter_layout);
                };
                try self.visit(pair.body, index, point_size, style, depth + 1);
            },
            .row => |range| {
                if (range.start > self.tree.children.len or range.len > self.tree.children.len - range.start) return error.InvalidEquationTree;
                for (self.tree.children[range.start..][0..range.len]) |child| try self.visit(child, index, point_size, style, depth + 1);
            },
            .grid => |grid_value| {
                var unsupported = grid_value.kind == .sladder;
                if (!grid_value.closed) try self.block(index, .unclosed_group);
                const range = grid_value.rows;
                if (range.start > self.tree.children.len or range.len > self.tree.children.len - range.start) return error.InvalidEquationTree;
                var columns: ?usize = null;
                for (self.tree.children[range.start..][0..range.len]) |child| {
                    if (child >= index or self.tree.nodes[child].data != .row) return error.InvalidEquationTree;
                    const count = self.tree.nodes[child].data.row.len;
                    if (@import("grid_types.zig").isPile(grid_value.kind) and count != 1) unsupported = true;
                    if (columns) |expected| {
                        if (count != expected) unsupported = true;
                    } else columns = count;
                    try self.visit(child, index, point_size, style, depth + 1);
                }
                if (unsupported) try self.block(index, .grid_layout);
            },
            .fraction, .atop => |pair| {
                try self.visit(pair.top, index, point_size * self.options.fraction_scale, style, depth + 1);
                try self.visit(pair.bottom, index, point_size * self.options.fraction_scale, style, depth + 1);
            },
            .scripts => |scripts| {
                try self.visit(scripts.base, index, point_size, style, depth + 1);
                if (scripts.sub) |sub| try self.visit(sub, index, point_size * self.options.script_scale, style, depth + 1);
                if (scripts.sup) |sup| try self.visit(sup, index, point_size * self.options.script_scale, style, depth + 1);
            },
            .radical => |body| {
                try self.visit(body, index, point_size, style, depth + 1);
            },
            .indexed_radical => |root| {
                try self.visit(root.index, index, point_size * self.options.script_scale, style, depth + 1);
                try self.visit(root.body, index, point_size, style, depth + 1);
            },
            .command => |command| {
                _ = try self.tokenText(command.token);
                const classified = @import("commands.zig").lookup(command.token.value);
                if ((command.family == .lower_limit or command.family == .upper_limit) and classified != null and classified.?.family == command.family) {
                    try self.request(index, command.token, classified.?.canonical, point_size, font.function(), .function);
                } else if (command.family == .big_operator and @import("big_operator.zig").resolve(command.token.value) != null) {
                    try self.request(index, command.token, @import("big_operator.zig").resolve(command.token.value).?, point_size, font.number(style), .symbol);
                } else if (command.family != .integral or @import("integral_geometry.zig").resolve(command.token.value) == null) try self.block(index, .unsupported_command);
            },
            .unmatched_delimiter => try self.block(index, .unmatched_delimiter),
        }
        var cursor = self.heads[index];
        while (cursor) |link_index| {
            const link = self.links[link_index];
            const scripts = self.tree.nodes[link.script].data.scripts;
            const linked_style = try context.linkedStyle(self.tree, link, style);
            if (scripts.sub) |sub| try self.visit(sub, link.script, point_size * self.options.script_scale, linked_style, depth + 1);
            if (scripts.sup) |sup| try self.visit(sup, link.script, point_size * self.options.script_scale, linked_style, depth + 1);
            cursor = self.next[link_index];
        }
    }
};

pub fn build(a: std.mem.Allocator, tree: *const ast.Tree, options: Options) !types.Plan {
    if (!std.math.isFinite(options.max_size) or options.max_size <= 0) return error.InvalidEquationMeasurementSize;
    for ([_]f64{ options.size, options.script_scale, options.fraction_scale }) |value| if (!std.math.isFinite(value) or value <= 0) return error.InvalidEquationMeasurementSize;
    if (tree.nodes.len > options.max_nodes or tree.source.len > options.max_source_bytes) return error.EquationMeasurementLimitExceeded;
    if (tree.root >= tree.nodes.len) return error.InvalidEquationTree;
    var links = try context.analyze(a, tree, .{ .max_nodes = options.max_nodes, .max_steps = options.max_steps });
    defer links.deinit();
    const source = try a.dupe(u8, tree.source);
    errdefer a.free(source);
    const by_script = try a.alloc(?usize, tree.nodes.len);
    defer a.free(by_script);
    @memset(by_script, null);
    const heads = try a.alloc(?usize, tree.nodes.len);
    defer a.free(heads);
    @memset(heads, null);
    const next = try a.alloc(?usize, links.links.len);
    defer a.free(next);
    for (links.links, 0..) |link, index| {
        if (link.script >= tree.nodes.len or link.target >= tree.nodes.len) return error.InvalidEquationTree;
        by_script[link.script] = index;
        next[index] = heads[link.target];
        heads[link.target] = index;
    }
    const seen = try a.alloc(bool, tree.nodes.len);
    defer a.free(seen);
    @memset(seen, false);
    var builder: Builder = .{ .a = a, .tree = tree, .source = source, .options = options, .links = links.links, .by_script = by_script, .heads = heads, .next = next, .seen = seen, .remaining = options.max_steps };
    defer builder.requests.deinit(a);
    defer builder.blockers.deinit(a);
    if (links.pending_diagnostics != 0 or links.pending_candidates != 0) try builder.block(null, .unresolved_context);
    try builder.visit(tree.root, tree.nodes.len, options.size, .{}, 0);
    const requests = try builder.requests.toOwnedSlice(a);
    errdefer a.free(requests);
    const blockers = try builder.blockers.toOwnedSlice(a);
    return .{ .allocator = a, .size = options.size, .script_scale = options.script_scale, .fraction_scale = options.fraction_scale, .source = source, .requests = requests, .blockers = blockers, .allow_unclosed_groups = options.allow_unclosed_groups, .recovered_open_groups = builder.recovered_open_groups };
}
