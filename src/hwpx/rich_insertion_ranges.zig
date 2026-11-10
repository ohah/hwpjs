//! A request-owned partition of the actual after paragraph. Text and XML
//! provenance stay with the original Sites and spans.
const std = @import("std");
const paint = @import("character_style_paint.zig");
const Span = paint.Span;
const Sites = @import("text_sites.zig").Sites;
const Range = @import("../model/formatting_patch.zig").Range;
pub const Work = struct {
    spans: usize = 0,
    ranges: usize = 0,
    scalars: usize = 0,
    fragments: usize = 0,
    resource_steps: usize = 0,
    paint_steps: usize = 0,
    font_ensures: usize = 0,
};
pub const Piece = struct { span: Span, resource: ?usize = null };
const Resource = struct { stages: [8]?u32 = @splat(null) };
pub const Cut = struct { first: usize, end: usize };
pub const Plan = struct {
    pieces: std.ArrayList(Piece) = .empty,
    resources: std.ArrayList(Resource) = .empty,
    representatives: std.ArrayList(Range) = .empty,
    cuts: std.ArrayList(Cut) = .empty,
    work: if (@import("builtin").is_test) Work else void = if (@import("builtin").is_test) .{} else {},

    pub fn deinit(self: *Plan, a: std.mem.Allocator) void {
        self.pieces.deinit(a);
        self.resources.deinit(a);
        self.representatives.deinit(a);
        self.cuts.deinit(a);
    }

    pub fn emit(self: *const Plan, a: std.mem.Allocator, limit: usize) ![]Span {
        var output: std.ArrayList(Span) = .empty;
        defer output.deinit(a);
        for (self.pieces.items) |piece| try paint.append(a, &output, piece.span, limit);
        return output.toOwnedSlice(a);
    }

    pub fn count(self: *Plan, comptime field: []const u8) void {
        if (@import("builtin").is_test) @field(self.work, field) += 1;
    }
};

const ScalarCursor = struct {
    byte: usize = 0,
    unit: usize = 0,
    fn advance(self: *ScalarCursor, text: []const u8, stop: usize, plan: *Plan) !void {
        while (self.unit < stop) {
            const scalar = (try @import("../xml/scalars.zig").read(text, self.byte, .utf8)) orelse return error.InvalidTextPosition;
            self.unit += if (scalar.value > 0xffff) @as(usize, 2) else 1;
            self.byte = scalar.end;
            plan.count("scalars");
        }
        if (self.unit != stop) return error.SplitSurrogatePair;
    }
};

/// 'base' is the independently derived live site/inline-control projection.
pub fn prepare(a: std.mem.Allocator, sites: *const Sites, base: []const Span, current: []const Span, ranges: []const Range) !Plan {
    if (base.len == 0 or current.len == 0 or ranges.len == 0) return error.InvalidTextPosition;
    var plan: Plan = .{};
    errdefer plan.deinit(a);
    var previous_end: usize = 0;
    for (ranges) |range| {
        if (range.startUnit < previous_end or range.startUnit >= range.endUnit or range.endUnit > base[base.len - 1].end_unit)
            return error.InvalidTextPosition;
        previous_end = range.endUnit;
        plan.count("ranges");
    }
    var indices: std.AutoHashMapUnmanaged(u32, usize) = .empty;
    defer indices.deinit(a);
    var source_index: usize = 0;
    var range_index: usize = 0;
    var cursor: usize = 0;
    var scalar: ScalarCursor = .{};
    for (current) |span| {
        plan.count("spans");
        if (source_index >= base.len or span.start_unit != cursor or span.end_unit < cursor) return error.InvalidTextSites;
        const source = base[source_index];
        if (span.site_index != source.site_index or span.site_start_unit != source.site_start_unit or span.run_element != source.run_element or
            span.tab_element != source.tab_element or span.anchor_element != source.anchor_element or span.end_unit > source.end_unit)
            return error.SourceBindingMismatch;
        if (span.canonical_fragment != null) return error.UnsupportedTitleFormattingProjection;
        const control = source.tab_element != null or source.anchor_element != null;
        if (!control and (source.site_index >= sites.items.len or source.site_start_unit > cursor)) return error.InvalidTextSites;
        const text = if (control) "" else sites.items[source.site_index].text;
        if (control and (span.start_unit != source.start_unit or span.end_unit != source.end_unit)) return error.InvalidTextSites;
        if (span.start_unit == span.end_unit) {
            try plan.pieces.append(a, .{ .span = span });
            plan.count("fragments");
        }
        while (cursor < span.end_unit) {
            while (range_index < ranges.len and ranges[range_index].endUnit <= cursor) range_index += 1;
            const range = if (range_index < ranges.len) ranges[range_index] else null;
            var part = span;
            part.start_unit = cursor;
            var resource: ?usize = null;
            if (range) |r| {
                if (cursor >= r.startUnit) {
                    if (control) return error.ProtectedInlineControl;
                    part.end_unit = @min(span.end_unit, r.endUnit);
                    const id = span.char_shape_id orelse return error.InvalidCharacterShapeReference;
                    const entry = try indices.getOrPut(a, id);
                    if (!entry.found_existing) {
                        entry.value_ptr.* = plan.resources.items.len;
                        try plan.resources.append(a, .{});
                        try plan.representatives.append(a, .{ .startUnit = @intCast(cursor), .endUnit = @intCast(part.end_unit) });
                    }
                    resource = entry.value_ptr.*;
                    const end = plan.pieces.items.len + 1;
                    if (plan.cuts.items.len == range_index) {
                        try plan.cuts.append(a, .{ .first = end - 1, .end = end });
                    } else {
                        plan.cuts.items[range_index].end = end;
                    }
                } else {
                    part.end_unit = @min(span.end_unit, r.startUnit);
                }
            }
            if (!control) try scalar.advance(text, part.end_unit - source.site_start_unit, &plan);
            try plan.pieces.append(a, .{ .span = part, .resource = resource });
            plan.count("fragments");
            cursor = part.end_unit;
        }
        if (cursor == source.end_unit) {
            if (!control and scalar.byte != text.len) return error.InvalidTextSites;
            source_index += 1;
            scalar = .{};
        }
    }
    if (source_index != base.len or plan.cuts.items.len != ranges.len) return error.InvalidTextSites;
    return plan;
}

// Only needed when the unmerged partition can exceed the existing span limit.
// A replacement changes only internal and neighboring edges of its own cut.
pub const SpanBudget = struct {
    limit: usize,
    count: ?usize = null,

    pub fn init(plan: *const Plan, limit: usize) SpanBudget {
        if (plan.pieces.items.len <= limit) return .{ .limit = limit };
        const rows = plan.pieces.items;
        return .{ .limit = limit, .count = 1 + edges(rows, .{ .first = 0, .end = rows.len }, null) };
    }

    pub fn validate(self: SpanBudget, plan: *const Plan, cut: Cut) !void {
        const count = self.count orelse return;
        const rows = plan.pieces.items;
        const id = rows[0].span.char_shape_id orelse return error.InvalidCharacterShapeReference;
        if (count - edges(rows, cut, null) + edges(rows, cut, id) > self.limit) return error.LimitExceeded;
    }

    pub fn replace(self: *SpanBudget, plan: *Plan, cut: Cut, id: u32) !void {
        const rows = plan.pieces.items;
        if (self.count) |count| {
            const after = count - edges(rows, cut, null) + edges(rows, cut, id);
            if (after > self.limit) return error.LimitExceeded;
            self.count = after;
        }
        for (rows[cut.first..cut.end]) |*piece| piece.span.char_shape_id = id;
    }
};

fn edges(rows: []const Piece, cut: Cut, id: ?u32) usize {
    var count: usize = 0;
    for (@max(1, cut.first)..@min(rows.len, cut.end + 1)) |i| {
        var left = rows[i - 1].span;
        var right = rows[i].span;
        if (id) |value| {
            if (i > cut.first and rows[i - 1].resource != null) left.char_shape_id = value;
            if (i < cut.end and rows[i].resource != null) right.char_shape_id = value;
        }
        if (!joins(left, right)) count += 1;
    }
    return count;
}

pub fn joins(left: Span, right: Span) bool {
    return left.end_unit > left.start_unit and right.end_unit > right.start_unit and
        left.end_unit == right.start_unit and left.site_index == right.site_index and
        left.site_start_unit == right.site_start_unit and left.run_element == right.run_element and
        left.char_shape_id == right.char_shape_id and left.tab_element == right.tab_element and
        left.anchor_element == right.anchor_element and left.canonical_fragment == right.canonical_fragment;
}
