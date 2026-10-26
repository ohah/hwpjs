//! Measured AST layout. Owned paint geometry, no browser or document mutation.
const std = @import("std");
const ast = @import("ast.zig");
const types = @import("measurement_types.zig");
const measured = @import("measured_requests.zig");
const m = @import("layout_metrics.zig");
const fraction = @import("fraction_geometry.zig");
const script = @import("script_geometry.zig");
const context = @import("script_context.zig");
const radical = @import("radical_geometry.zig");
const grid_geometry = @import("grid_geometry.zig");
const delimiters = @import("delimiter_geometry.zig");
const decorations = @import("decoration_geometry.zig");
const integrals = @import("integral_geometry.zig");
const limits_geometry = @import("limit_geometry.zig");
pub const Glyph = struct { request: usize, x: f64, baseline: f64 };
pub const Result = struct {
    allocator: std.mem.Allocator,
    box: m.Box,
    glyphs: []Glyph,
    rules: []fraction.Rule,
    paths: []radical.Path,
    rectangles: []m.Rectangle,
    curves: []delimiters.Curve,
    pub fn deinit(self: *Result) void {
        self.allocator.free(self.glyphs);
        self.allocator.free(self.rules);
        self.allocator.free(self.paths);
        self.allocator.free(self.rectangles);
        self.allocator.free(self.curves);
        self.* = undefined;
    }
};
/// Parameters are em ratios; the request plan owns font sizes and child scales.
pub const Options = struct {
    fraction: fraction.Parameters,
    script: script.Parameters,
    normal_space: f64,
    thin_space: f64,
    radical: ?radical.Parameters = null,
    grid: ?grid_geometry.Parameters = null,
    delimiters: ?delimiters.Parameters = null,
    decoration: ?decorations.Parameters = null,
    integral: ?integrals.Parameters = null,
    limit: ?limits_geometry.Parameters = null,
    limits: m.Limits = .{},
    max_steps: usize = 4 * 1024 * 1024,
};
const Span = struct { glyph: usize, rule: usize, path: usize, rectangle: usize, curve: usize };
const empty: m.Box = .{ .width = 0, .ascent = 0, .descent = 0 };
const Builder = struct {
    a: std.mem.Allocator,
    tree: *const ast.Tree,
    plan: *const types.Plan,
    measurements: []const measured.Measurement,
    options: Options,
    links: []const context.Link,
    requests: []?usize,
    seen: []bool,
    remaining: usize,
    glyphs: std.ArrayList(Glyph) = .empty,
    rules: std.ArrayList(fraction.Rule) = .empty,
    paths: std.ArrayList(radical.Path) = .empty,
    rectangles: std.ArrayList(m.Rectangle) = .empty,
    curves: std.ArrayList(delimiters.Curve) = .empty,
    fn step(self: *Builder) !void {
        if (self.remaining == 0) return error.EquationLayoutLimitExceeded;
        self.remaining -= 1;
    }
    fn span(self: *Builder) Span {
        return .{ .glyph = self.glyphs.items.len, .rule = self.rules.items.len, .path = self.paths.items.len, .rectangle = self.rectangles.items.len, .curve = self.curves.items.len };
    }
    fn move(self: *Builder, from: Span, to: Span, x: f64, y: f64) !void {
        for (self.glyphs.items[from.glyph..to.glyph]) |*value| {
            try self.step();
            value.x += x;
            value.baseline += y;
            try m.dimension(value.x, self.options.limits);
            try m.dimension(@abs(value.baseline), self.options.limits);
        }
        for (self.rules.items[from.rule..to.rule]) |*value| {
            try self.step();
            value.x += x;
            value.y += y;
            try m.dimension(value.x, self.options.limits);
            try m.dimension(@abs(value.y), self.options.limits);
        }
        for (self.paths.items[from.path..to.path]) |*path| for (&path.points) |*point| {
            try self.step();
            point.x += x;
            point.y += y;
            try m.dimension(point.x, self.options.limits);
            try m.dimension(@abs(point.y), self.options.limits);
        };
        for (self.rectangles.items[from.rectangle..to.rectangle]) |*rect| {
            try self.step();
            rect.x += x;
            rect.y += y;
            try m.dimension(rect.x, self.options.limits);
            try m.dimension(@abs(rect.y), self.options.limits);
        }
        for (self.curves.items[from.curve..to.curve]) |*curve| for (&curve.points) |*point| {
            try self.step();
            point.x += x;
            point.y += y;
            try m.dimension(point.x, self.options.limits);
            try m.dimension(@abs(point.y), self.options.limits);
        };
    }
    fn visit(self: *Builder, id: usize, parent: usize, size: f64, depth: usize) anyerror!m.Box {
        try self.step();
        if (id >= self.tree.nodes.len or id >= parent or depth >= 64 or self.seen[id]) return error.InvalidEquationTree;
        if (!std.math.isFinite(size) or size <= 0) return error.InvalidEquationMeasurementSize;
        self.seen[id] = true;
        for (self.links) |link| {
            try self.step();
            if (link.script == id) return if (link.retained_base) |base| self.visit(base, id, size, depth + 1) else empty;
        }
        const start = self.span();
        var box = empty;
        const node = self.tree.nodes[id];
        if (self.requests[id]) |request| {
            if (self.plan.requests[request].size != size) return error.EquationMeasurementPlanMismatch;
            try self.glyphs.append(self.a, .{ .request = request, .x = 0, .baseline = 0 });
            box = self.measurements[request].box;
        } else switch (node.data) {
            .row => |row| {
                if (row.start > self.tree.children.len or row.len > self.tree.children.len - row.start) return error.InvalidEquationTree;
                for (self.tree.children[row.start..][0..row.len]) |child| {
                    const from = self.span();
                    const part = try self.visit(child, id, size, depth + 1);
                    try self.move(from, self.span(), box.width, 0);
                    box = (try @import("row_geometry.zig").join(box, part, self.options.limits)).box;
                }
            },
            .grid => |grid_value| box = try self.gridBody(grid_value, id, size, depth),
            .delimited => |pair| {
                const token_types = @import("delimiter_tokens.zig");
                if (pair.left == null and pair.right == null) return error.InvalidEquationTree;
                const left = if (pair.left) |token| token_types.resolve(token.value) orelse return error.UnsupportedEquationLayout else token_types.Side{ .shape = .hidden };
                const right = if (pair.right) |token| token_types.resolve(token.value) orelse return error.UnsupportedEquationLayout else token_types.Side{ .shape = .hidden };
                const params = self.options.delimiters orelse return error.UnsupportedEquationLayout;
                const body = try self.visit(pair.body, id, size, depth + 1);
                const placed = try @import("paired_delimiter_geometry.zig").place(body, left, right, .{ .width = params.width * size, .gap = params.gap * size, .thickness = params.thickness * size }, self.options.limits);
                try self.move(start, self.span(), placed.body.x, placed.body.baseline);
                try self.rectangles.appendSlice(self.a, placed.rectangles[0..placed.rectangle_count]);
                try self.curves.appendSlice(self.a, placed.curves[0..placed.curve_count]);
                box = placed.box;
            },
            .group => |group| {
                if (!group.closed and !self.plan.allow_unclosed_groups) return error.UnsupportedEquationLayout;
                box = try self.visit(group.body, id, size, depth + 1);
            },
            .styled => |styled| {
                if (styled.body) |body| box = try self.visit(body, id, size, depth + 1);
            },
            .decoration => |value| {
                const kind = decorations.resolve(value.token.value) orelse return error.UnsupportedEquationLayout;
                const params = self.options.decoration orelse return error.UnsupportedEquationLayout;
                const body = try self.visit(value.body, id, size, depth + 1);
                const placed = try decorations.place(body, kind, .{ .gap = params.gap * size, .height = params.height * size, .thickness = params.thickness * size }, self.options.limits);
                try self.move(start, self.span(), placed.body.x, placed.body.baseline);
                try self.curves.appendSlice(self.a, placed.curves[0..placed.curve_count]);
                box = placed.box;
            },
            .fraction, .atop => |pair| {
                const middle_start = self.span();
                const top = try self.visit(pair.top, id, size * self.plan.fraction_scale, depth + 1);
                const middle = self.span();
                const bottom = try self.visit(pair.bottom, id, size * self.plan.fraction_scale, depth + 1);
                const p = self.options.fraction;
                const placement = try fraction.place(top, bottom, .{ .padding = p.padding * size, .gap = p.gap * size, .rule_thickness = p.rule_thickness * size, .axis = p.axis * size }, node.data == .fraction, self.options.limits);
                try self.move(middle_start, middle, placement.numerator.x, placement.numerator.baseline);
                try self.move(middle, self.span(), placement.denominator.x, placement.denominator.baseline);
                if (placement.rule) |rule| try self.rules.append(self.a, rule);
                box = placement.box;
            },
            .scripts => |scripts| {
                box = try self.visit(scripts.base, id, size, depth + 1);
                box = try self.attach(start, box, scripts, id, size, depth, if (scripts.side == .left) .left else .right);
            },
            .command => |command| {
                if (command.family != .integral) return error.UnsupportedEquationLayout;
                const kind = integrals.resolve(command.token.value) orelse return error.UnsupportedEquationLayout;
                const p = self.options.integral orelse return error.UnsupportedEquationLayout;
                const placed = try integrals.place(kind, .{ .width = p.width * size, .height = p.height * size, .gap = p.gap * size, .thickness = p.thickness * size }, self.options.limits);
                try self.curves.appendSlice(self.a, placed.curves[0..placed.curve_count]);
                box = placed.box;
            },
            .radical => |body| {
                box = try self.radicalBody(start, body, id, size, depth);
            },
            .indexed_radical => |root| {
                box = try self.radicalBody(start, root.body, id, size, depth);
                const base_end = self.span();
                const index_box = try self.visit(root.index, id, size * self.plan.script_scale, depth + 1);
                const placed = try script.place(box, null, index_box, .left, .{ .gap = self.options.script.gap * size, .superscript_shift = @max(0, box.ascent - index_box.ascent / 2), .subscript_shift = 0, .clearance = 0 }, self.options.limits);
                try self.move(start, base_end, placed.base.x, placed.base.baseline);
                try self.move(base_end, self.span(), placed.sup.?.x, placed.sup.?.baseline);
                box = placed.box;
            },
            .literal => |token| {
                box.width = switch (token.kind) {
                    .normal_space => self.options.normal_space * size,
                    .thin_space => self.options.thin_space * size,
                    else => return error.EquationMeasurementPlanMismatch,
                };
            },
            else => return error.UnsupportedEquationLayout,
        }
        for (self.links) |link| {
            try self.step();
            if (link.target == id) box = try self.attach(start, box, self.tree.nodes[link.script].data.scripts, link.script, size, depth, if (link.side == .left) .left else .right);
        }
        try m.validate(box, self.options.limits);
        return box;
    }
    fn commandAtom(self: *Builder, initial: usize) !?ast.Command {
        var index = initial;
        for (0..64) |_| {
            try self.step();
            if (index >= self.tree.nodes.len) return error.InvalidEquationTree;
            switch (self.tree.nodes[index].data) {
                .command => |command| return command,
                .styled => |styled| {
                    const body = styled.body orelse return null;
                    if (body >= index) return error.InvalidEquationTree;
                    index = body;
                },
                else => return null,
            }
        }
        return error.InvalidEquationTree;
    }
    fn attach(self: *Builder, start: Span, base: m.Box, scripts: ast.Scripts, parent: usize, size: f64, depth: usize, side: script.Side) !m.Box {
        const base_end = self.span();
        const sub = if (scripts.sub) |id| try self.visit(id, parent, size * self.plan.script_scale, depth + 1) else null;
        const sub_end = self.span();
        const sup = if (scripts.sup) |id| try self.visit(id, parent, size * self.plan.script_scale, depth + 1) else null;
        const p = self.options.script;
        const atom = if (side == .right) try self.commandAtom(scripts.base) else null;
        const integral = if (atom) |command| command.family == .integral and integrals.resolve(command.token.value) != null else false;
        const limit = if (atom) |command| ((command.family == .lower_limit or command.family == .upper_limit) and limits_geometry.resolve(command.token.value)) or (command.family == .big_operator and @import("big_operator.zig").resolve(command.token.value) != null) else false;
        const sup_shift = if (integral and sup != null) @max(0, base.ascent - sup.?.ascent) else p.superscript_shift * size;
        const sub_shift = if (integral and sub != null) @max(0, base.descent - sub.?.descent) else p.subscript_shift * size;
        const placed = if (limit) try limits_geometry.place(base, sub, sup, .{ .gap = (self.options.limit orelse return error.UnsupportedEquationLayout).gap * size }, self.options.limits) else try script.place(base, sub, sup, side, .{ .gap = p.gap * size, .superscript_shift = sup_shift, .subscript_shift = sub_shift, .clearance = p.clearance * size }, self.options.limits);
        try self.move(start, base_end, placed.base.x, placed.base.baseline);
        if (placed.sub) |value| try self.move(base_end, sub_end, value.x, value.baseline);
        if (placed.sup) |value| try self.move(sub_end, self.span(), value.x, value.baseline);
        return placed.box;
    }
    fn radicalBody(self: *Builder, start: Span, body: usize, parent: usize, size: f64, depth: usize) !m.Box {
        const p = self.options.radical orelse return error.UnsupportedEquationLayout;
        const part = try self.visit(body, parent, size, depth + 1);
        const placed = try radical.place(part, .{ .hook_width = p.hook_width * size, .gap = p.gap * size, .padding = p.padding * size, .thickness = p.thickness * size }, self.options.limits);
        try self.move(start, self.span(), placed.body.x, placed.body.baseline);
        try self.paths.append(self.a, placed.path);
        return placed.box;
    }
    fn gridBody(self: *Builder, grid_value: ast.Grid, parent: usize, size: f64, depth: usize) !m.Box {
        const p = self.options.grid orelse return error.UnsupportedEquationLayout;
        const range = grid_value.rows;
        if (!grid_value.closed or range.start > self.tree.children.len or range.len > self.tree.children.len - range.start or range.len == 0) return error.InvalidEquationTree;
        const rows = self.tree.children[range.start..][0..range.len];
        if (rows[0] >= parent or self.tree.nodes[rows[0]].data != .row) return error.InvalidEquationTree;
        const columns = self.tree.nodes[rows[0]].data.row.len;
        const count = std.math.mul(usize, rows.len, columns) catch return error.EquationLayoutLimitExceeded;
        if (count == 0 or count > 65536) return error.EquationLayoutLimitExceeded;
        const cells = try self.a.alloc(grid_geometry.Cell, count);
        defer self.a.free(cells);
        const spans = try self.a.alloc(Span, count + 1);
        defer self.a.free(spans);
        var offset: usize = 0;
        for (rows) |row| {
            try self.step();
            if (row >= parent or self.seen[row] or self.tree.nodes[row].data != .row) return error.InvalidEquationTree;
            self.seen[row] = true;
            const cell_range = self.tree.nodes[row].data.row;
            if (cell_range.len != columns) return error.UnsupportedEquationGridLayout;
            if (cell_range.start > self.tree.children.len or cell_range.len > self.tree.children.len - cell_range.start) return error.InvalidEquationTree;
            for (self.tree.children[cell_range.start..][0..cell_range.len]) |cell| {
                if (cell >= row or self.tree.nodes[cell].data != .row) return error.InvalidEquationTree;
                spans[offset] = self.span();
                cells[offset] = .{ .box = try self.visit(cell, row, size, depth + 2), .empty = self.tree.nodes[cell].data.row.len == 0 };
                offset += 1;
            }
        }
        spans[count] = self.span();
        var placed = try grid_geometry.place(self.a, cells, rows.len, columns, grid_value.kind, .{ .column_gap = p.column_gap * size, .row_gap = p.row_gap * size, .padding = p.padding * size, .thickness = p.thickness * size, .axis = p.axis * size, .minimum_row_height = p.minimum_row_height * size }, self.options.limits);
        defer placed.deinit();
        if (grid_value.kind == .cases) {
            const params = self.options.delimiters orelse return error.UnsupportedEquationLayout;
            const wrapped_case = try @import("paired_delimiter_geometry.zig").place(placed.box, .{ .shape = .braces }, .{ .shape = .hidden }, .{ .width = params.width * size, .gap = params.gap * size, .thickness = params.thickness * size }, self.options.limits);
            for (placed.cells, 0..) |cell, i| try self.move(spans[i], spans[i + 1], cell.x + wrapped_case.body.x, cell.baseline + wrapped_case.body.baseline);
            try self.rectangles.appendSlice(self.a, placed.rectangles);
            try self.rectangles.appendSlice(self.a, wrapped_case.rectangles[0..wrapped_case.rectangle_count]);
            try self.curves.appendSlice(self.a, wrapped_case.curves[0..wrapped_case.curve_count]);
            return wrapped_case.box;
        }
        var wrapped: ?delimiters.Result = null;
        const kind: ?delimiters.Kind = switch (grid_value.kind) {
            .pmatrix => .parentheses,
            .bmatrix => .brackets,
            .dmatrix => .bars,
            else => null,
        };
        if (kind) |style| {
            const params = self.options.delimiters orelse return error.UnsupportedEquationLayout;
            wrapped = try delimiters.place(placed.box, style, .{ .width = params.width * size, .gap = params.gap * size, .thickness = params.thickness * size }, self.options.limits);
        }
        const shift_x = if (wrapped) |value| value.body.x else 0;
        for (placed.cells, 0..) |cell, i| try self.move(spans[i], spans[i + 1], cell.x + shift_x, cell.baseline);
        try self.rectangles.appendSlice(self.a, placed.rectangles);
        if (wrapped) |value| {
            try self.rectangles.appendSlice(self.a, value.rectangles[0..value.rectangle_count]);
            try self.curves.appendSlice(self.a, value.curves[0..value.curve_count]);
            return value.box;
        }
        return placed.box;
    }
};
pub fn build(a: std.mem.Allocator, tree: *const ast.Tree, plan: *const types.Plan, values: []const measured.Measurement, options: Options) !Result {
    if (!plan.ready()) return error.UnsupportedEquationLayout;
    if (!std.mem.eql(u8, tree.source, plan.source)) return error.EquationMeasurementPlanMismatch;
    try measured.validate(plan, values, options.limits);
    for ([_]f64{ options.normal_space, options.thin_space, options.fraction.padding, options.fraction.gap, options.fraction.rule_thickness, options.fraction.axis, options.script.gap, options.script.superscript_shift, options.script.subscript_shift, options.script.clearance }) |v| try m.dimension(v, options.limits);
    var links = try context.analyze(a, tree, .{});
    defer links.deinit();
    if (links.pending_candidates != 0 or links.pending_diagnostics != 0) return error.UnsupportedEquationLayout;
    const requests = try a.alloc(?usize, tree.nodes.len);
    defer a.free(requests);
    @memset(requests, null);
    for (plan.requests, 0..) |request, index| {
        if (request.node >= requests.len or requests[request.node] != null) return error.EquationMeasurementPlanMismatch;
        requests[request.node] = index;
    }
    const seen = try a.alloc(bool, tree.nodes.len);
    defer a.free(seen);
    @memset(seen, false);
    var b: Builder = .{ .a = a, .tree = tree, .plan = plan, .measurements = values, .options = options, .links = links.links, .requests = requests, .seen = seen, .remaining = options.max_steps };
    defer b.glyphs.deinit(a);
    defer b.rules.deinit(a);
    defer b.paths.deinit(a);
    defer b.rectangles.deinit(a);
    defer b.curves.deinit(a);
    var box = try b.visit(tree.root, tree.nodes.len, plan.size, 0);
    // Re-enclose actual translated primitives, not only their pre-translation
    // child boxes: floating-point association can differ by one last bit.
    for (b.glyphs.items) |glyph| {
        try b.step();
        const value = values[glyph.request].box;
        try m.includeRectangle(&box, .{ .x = glyph.x, .y = glyph.baseline - value.ascent, .width = value.width, .height = value.ascent + value.descent }, options.limits);
    }
    for (b.rules.items) |rule| {
        try b.step();
        try m.includeRectangle(&box, .{ .x = rule.x, .y = rule.y - rule.thickness / 2, .width = rule.width, .height = rule.thickness }, options.limits);
    }
    for (b.rectangles.items) |rect| {
        try b.step();
        try m.includeRectangle(&box, rect, options.limits);
    }
    for (b.paths.items) |path| for (path.points) |point| {
        try b.step();
        try m.includeStrokePoint(&box, point, path.thickness, options.limits);
    };
    for (b.curves.items) |curve| for (curve.points) |point| {
        try b.step();
        try m.includeStrokePoint(&box, point, curve.thickness, options.limits);
    };
    if (b.glyphs.items.len != plan.requests.len) return error.EquationMeasurementPlanMismatch;
    const glyphs = try b.glyphs.toOwnedSlice(a);
    errdefer a.free(glyphs);
    const rules = try b.rules.toOwnedSlice(a);
    errdefer a.free(rules);
    const paths = try b.paths.toOwnedSlice(a);
    errdefer a.free(paths);
    const rectangles = try b.rectangles.toOwnedSlice(a);
    errdefer a.free(rectangles);
    return .{ .allocator = a, .box = box, .glyphs = glyphs, .rules = rules, .paths = paths, .rectangles = rectangles, .curves = try b.curves.toOwnedSlice(a) };
}
