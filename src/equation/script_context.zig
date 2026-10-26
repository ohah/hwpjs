//! Read-only script placement links. Never rewrites source, AST or diagnostics.
const std = @import("std");
const ast = @import("ast.zig");
const font = @import("font.zig");
pub const Link = struct {
    script: usize,
    target: usize,
    side: enum { left, right },
    /// An operator used as a syntactic carrier still needs its own painting.
    retained_base: ?usize,
    style: font.Style,
};
pub const Options = struct { max_nodes: usize = 65536, max_links: usize = 65536, max_diagnostics: usize = 1024, max_steps: usize = 4 * 1024 * 1024 };
pub const Result = struct {
    allocator: std.mem.Allocator,
    links: []Link,
    resolved_diagnostics: usize,
    pending_diagnostics: usize,
    pending_candidates: usize,
    pub fn deinit(self: *Result) void {
        self.allocator.free(self.links);
        self.* = undefined;
    }
};
const Carrier = struct {
    kind: enum { operand, blank, font_empty, operator },
    style: font.Style = .{},
    offsets: [64]usize = undefined,
    count: usize = 0,
};
fn checked(tree: *const ast.Tree, index: usize, parent: usize) !ast.Node {
    if (index >= tree.nodes.len or index >= parent) return error.InvalidEquationTree;
    return tree.nodes[index];
}
fn step(remaining: *usize) !void {
    if (remaining.* == 0) return error.EquationScriptContextLimitExceeded;
    remaining.* -= 1;
}
fn classify(tree: *const ast.Tree, initial: usize, parent: usize, remaining: *usize, inherited: font.Style) !Carrier {
    var result: Carrier = .{ .kind = .operand, .style = inherited };
    var index = initial;
    var bound = parent;
    while (true) {
        try step(remaining);
        const node = try checked(tree, index, bound);
        switch (node.data) {
            .styled => |styled| {
                if (result.count == result.offsets.len) return error.EquationDepthLimitExceeded;
                result.offsets[result.count] = styled.token.start;
                result.count += 1;
                result.style = font.apply(result.style, styled.change);
                if (styled.body) |body| {
                    bound = index;
                    index = body;
                } else {
                    result.kind = .font_empty;
                    return result;
                }
            },
            .group => |group| {
                const body = try checked(tree, group.body, index);
                if (body.data == .row and body.data.row.len == 0) result.kind = .blank;
                return result;
            },
            .literal => |token| {
                if (token.kind == .symbol) {
                    for ([_][]const u8{ "=", "+", "-", "*", "/", "<", ">", "<=", ">=", "!=", "==" }) |operator| {
                        if (std.mem.eql(u8, token.value, operator)) {
                            result.kind = .operator;
                            break;
                        }
                    }
                }
                return result;
            },
            else => return result,
        }
    }
}
fn eligible(tree: *const ast.Tree, index: usize, parent: usize, depth: usize, remaining: *usize) anyerror!bool {
    try step(remaining);
    if (depth >= 64) return error.EquationDepthLimitExceeded;
    const node = try checked(tree, index, parent);
    return switch (node.data) {
        .styled => |styled| if (styled.body) |body| eligible(tree, body, index, depth + 1, remaining) else false,
        .decoration => |value| eligible(tree, value.body, index, depth + 1, remaining),
        .scripts => |scripts| eligible(tree, scripts.base, index, depth + 1, remaining),
        .group => |group| block: {
            const body = try checked(tree, group.body, index);
            if (body.data != .row) return error.InvalidEquationTree;
            const range = body.data.row;
            if (range.start > tree.children.len or range.len > tree.children.len - range.start) return error.InvalidEquationTree;
            for (tree.children[range.start..][0..range.len]) |child| {
                if (try eligible(tree, child, group.body, depth + 1, remaining)) break :block true;
            }
            break :block false;
        },
        .literal => |token| switch (token.kind) {
            .identifier, .number, .text, .quoted => true,
            else => false,
        },
        .function, .radical, .indexed_radical, .fraction, .atop, .grid, .delimited => true,
        .symbol => |symbol_value| symbol_value.role == .operand,
        .command => |command| (command.family == .integral and @import("integral_geometry.zig").resolve(command.token.value) != null) or ((command.family == .lower_limit or command.family == .upper_limit) and @import("limit_geometry.zig").resolve(command.token.value)) or (command.family == .big_operator and @import("big_operator.zig").resolve(command.token.value) != null),
        else => false,
    };
}
pub fn analyze(a: std.mem.Allocator, tree: *const ast.Tree, options: Options) !Result {
    if (tree.nodes.len > options.max_nodes or tree.diagnostics.len > options.max_diagnostics) return error.LimitExceeded;
    if (tree.root >= tree.nodes.len) return error.InvalidEquationTree;
    var pending: std.AutoHashMap(usize, bool) = .init(a);
    defer pending.deinit();
    for (tree.diagnostics) |diagnostic| {
        if (diagnostic.kind != .unresolved_font_script_scope) continue;
        const entry = try pending.getOrPut(diagnostic.offset);
        if (entry.found_existing) return error.InvalidEquationDiagnostics;
        entry.value_ptr.* = false;
    }
    var links: std.ArrayList(Link) = .empty;
    defer links.deinit(a);
    var scripts_seen: std.AutoHashMap(usize, void) = .init(a);
    defer scripts_seen.deinit();
    var remaining = options.max_steps;
    var pending_candidates: usize = 0;
    for (tree.nodes, 0..) |node, parent| {
        try step(&remaining);
        if (node.data != .row) continue;
        const range = node.data.row;
        if (range.start > tree.children.len or range.len > tree.children.len - range.start) return error.InvalidEquationTree;
        const children = tree.children[range.start..][0..range.len];
        for (children, 0..) |index, ordinal| {
            try step(&remaining);
            const child = try checked(tree, index, parent);
            if (child.data != .scripts) continue;
            const inserted = try scripts_seen.getOrPut(index);
            if (inserted.found_existing) return error.InvalidEquationTree;
            // 명시적인 LSUB/LSUP 대상은 빈 그룹이어도 이웃으로 다시 연결하지 않습니다.
            if (child.data.scripts.side == .left) continue;
            const carrier = try classify(tree, child.data.scripts.base, index, &remaining, .{});
            if (carrier.kind == .operand) continue;
            var target: ?usize = null;
            const right = carrier.kind == .font_empty and ordinal != 0 and try eligible(tree, children[ordinal - 1], parent, 0, &remaining);
            if (right) {
                target = children[ordinal - 1];
            } else if (ordinal + 1 < children.len and try eligible(tree, children[ordinal + 1], parent, 0, &remaining)) {
                target = children[ordinal + 1];
            }
            if (target == null) {
                pending_candidates += 1;
                continue;
            }
            if (links.items.len >= options.max_links) return error.EquationScriptContextLimitExceeded;
            try links.append(a, .{ .script = index, .target = target.?, .side = if (right) .right else .left, .retained_base = if (carrier.kind == .operator) child.data.scripts.base else null, .style = carrier.style });
            for (carrier.offsets[0..carrier.count]) |offset| if (pending.getPtr(offset)) |resolved| {
                resolved.* = true;
            };
        }
    }
    var resolved: usize = 0;
    var iterator = pending.valueIterator();
    while (iterator.next()) |value| if (value.*) {
        resolved += 1;
    };
    return .{ .allocator = a, .links = try links.toOwnedSlice(a), .resolved_diagnostics = resolved, .pending_diagnostics = pending.count() - resolved, .pending_candidates = pending_candidates };
}

pub fn linkedStyle(tree: *const ast.Tree, link: Link, inherited: font.Style) !font.Style {
    if (link.script >= tree.nodes.len or tree.nodes[link.script].data != .scripts) return error.InvalidEquationTree;
    var remaining: usize = 64;
    return (try classify(tree, tree.nodes[link.script].data.scripts.base, link.script, &remaining, inherited)).style;
}
