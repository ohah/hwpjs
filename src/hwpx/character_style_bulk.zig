//! Request-only metadata draft over the text draft's single effective edit plan.
const std = @import("std");
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const paint = @import("character_style_paint.zig");
const Text = @import("text_splice_many.zig").Prepared;
const Span = paint.Span;
const Work = struct { spans: usize = 0, segments: usize = 0, changes: usize = 0, emits: usize = 0 };
fn tick(comptime measured: bool, work: if (measured) *Work else void, comptime field: []const u8) void {
    if (measured) @field(work, field) += 1;
}
pub const Prepared = struct {
    allocator: std.mem.Allocator,
    owner: *const Paragraph,
    text_owner: *const Text,
    source_pointer: ?[*]Span,
    source_len: usize,
    original: []Span,
    styles: ?[]Span,
    consumed: bool = false,
    pub fn deinit(self: *Prepared) void {
        self.allocator.free(self.original);
        if (self.styles) |rows| self.allocator.free(rows);
        self.* = undefined;
    }
    pub fn validate(self: *const Prepared, paragraph: *const Paragraph, text: *const Text) !void {
        if (self.consumed or paragraph != self.owner or text != self.text_owner) return error.StaleStyleDraft;
        const current = paragraph.character_styles;
        if ((current == null) != (self.source_pointer == null)) return error.StaleStyleDraft;
        if (current) |rows| {
            if (rows.ptr != self.source_pointer.? or rows.len != self.source_len) return error.StaleStyleDraft;
            for (rows, self.original) |now, old| if (!std.meta.eql(now, old)) return error.StaleStyleDraft;
        }
        try text.validate(&paragraph.sites);
    }
    /// Convenience for plain text+styles. Caller stages field/title/meta first;
    /// no allocations or fallible work follows successful text installation.
    pub fn commit(self: *Prepared, paragraph: *Paragraph, text: *Text) !bool {
        try self.validate(paragraph, text);
        const changed = try text.commit(&paragraph.sites);
        if (changed) {
            if (paragraph.character_styles) |old| self.allocator.free(old);
            paragraph.character_styles = self.styles.?;
            self.styles = null;
        }
        self.consumed = true;
        return changed;
    }
};
pub fn prepare(a: std.mem.Allocator, paragraph: *const Paragraph, text: *const Text, current: []const Span, limit: usize) !Prepared {
    return run(false, {}, a, paragraph, text, current, limit);
}
pub const testing = if (@import("builtin").is_test) struct {
    pub const Counters = Work;
    pub fn prepareMeasured(a: std.mem.Allocator, paragraph: *const Paragraph, text: *const Text, current: []const Span, limit: usize, work: *Counters) !Prepared {
        return run(true, work, a, paragraph, text, current, limit);
    }
} else struct {};
fn emit(comptime measured: bool, work: if (measured) *Work else void, a: std.mem.Allocator, output: *std.ArrayList(Span), original: Span, base: usize, cursor: *usize, length: usize, limit: usize) !void {
    if (length == 0) return;
    var span = original;
    span.start_unit = cursor.*;
    span.end_unit = std.math.add(usize, cursor.*, length) catch return error.LimitExceeded;
    span.site_start_unit = base;
    try paint.append(a, output, span, limit);
    cursor.* = span.end_unit;
    tick(measured, work, "emits");
}
fn keep(comptime measured: bool, work: if (measured) *Work else void, a: std.mem.Allocator, output: *std.ArrayList(Span), rows: []const Span, read: *usize, source_base: usize, local: *usize, until: usize, base: usize, cursor: *usize, limit: usize) !void {
    while (local.* < until) {
        while (read.* + 1 < rows.len and rows[read.*].end_unit <= source_base + local.*) {
            read.* += 1;
            tick(measured, work, "spans");
        }
        const row = rows[read.*];
        const stop = @min(until, row.end_unit - source_base);
        if (stop <= local.*) return error.InvalidTextSites;
        try emit(measured, work, a, output, row, base, cursor, stop - local.*, limit);
        local.* = stop;
    }
}
fn run(comptime measured: bool, work: if (measured) *Work else void, a: std.mem.Allocator, paragraph: *const Paragraph, text: *const Text, current: []const Span, limit: usize) !Prepared {
    // Metadata reads only the text draft's owned original axis/boundaries.
    // Source content is revalidated before either text or styles can commit.
    if (text.consumed or text.source != &paragraph.sites) return error.StaleTextDraft;
    if (paragraph.title_output_projection != null) return error.UnsupportedTitleFormattingProjection;
    if (paragraph.character_styles) |rows| if (rows.ptr != current.ptr or rows.len != current.len) return error.SourceBindingMismatch;
    const original = try a.dupe(Span, current);
    errdefer a.free(original);
    var output: std.ArrayList(Span) = .empty;
    errdefer output.deinit(a);
    var index: usize = 0;
    var base: usize = 0;
    for (text.positions) |position| {
        tick(measured, work, "segments");
        if (index >= current.len) return error.InvalidTextSites;
        if (position.kind != .text) {
            var span = current[index];
            const element = if (position.kind == .anchor) span.anchor_element else span.tab_element;
            if (element != position.index or span.start_unit != position.start_unit or span.end_unit != position.end_unit or span.end_unit - span.start_unit != 1 or (span.anchor_element != null and span.tab_element != null)) return error.InvalidTextSites;
            span.start_unit = base;
            span.end_unit = std.math.add(usize, base, 1) catch return error.LimitExceeded;
            span.site_start_unit = base;
            try paint.append(a, &output, span, limit);
            base = span.end_unit;
            index += 1;
            tick(measured, work, "spans");
            continue;
        }
        const first = current[index];
        const begin = index;
        var old: usize = position.start_unit;
        while (index < current.len and current[index].site_index == position.index and current[index].tab_element == null and current[index].anchor_element == null) : (index += 1) {
            const span = current[index];
            tick(measured, work, "spans");
            if (span.canonical_fragment != null) return error.UnsupportedTitleFormattingProjection;
            if (span.start_unit != old or span.end_unit < old or span.end_unit > position.end_unit or span.run_element != first.run_element or span.site_start_unit != position.start_unit) return error.InvalidTextSites;
            if (!text.scalarBoundary(position.index, span.start_unit - position.start_unit) or !text.scalarBoundary(position.index, span.end_unit - position.start_unit)) return error.SplitSurrogatePair;
            old = span.end_unit;
        }
        if (index == begin or old != position.end_unit) return error.InvalidTextSites;
        const rows = current[begin..index];
        var read: usize = 0;
        var inheritance: usize = 0;
        var local: usize = 0;
        var cursor = base;
        const output_start = output.items.len;
        var change_index = text.firstChange(position.index);
        while (change_index) |at| : (change_index = text.nextChange(at)) {
            const change = text.changes[at];
            tick(measured, work, "changes");
            try keep(measured, work, a, &output, rows, &read, position.start_unit, &local, change.unit_start, base, &cursor, limit);
            if (change.inserted_units != 0) {
                const point = position.start_unit + change.unit_start;
                while (inheritance + 1 < rows.len and (if (change.inherit_first_replaced) rows[inheritance].end_unit <= point else rows[inheritance].end_unit < point)) {
                    inheritance += 1;
                    tick(measured, work, "spans");
                }
                if (change.inherit_first_replaced and !(rows[inheritance].start_unit <= point and point < rows[inheritance].end_unit)) return error.InvalidTextSites;
                try emit(measured, work, a, &output, rows[inheritance], base, &cursor, change.inserted_units, limit);
            }
            local = change.unit_end;
            while (read + 1 < rows.len and rows[read].end_unit < position.start_unit + local) {
                read += 1;
                tick(measured, work, "spans");
            }
        }
        try keep(measured, work, a, &output, rows, &read, position.start_unit, &local, position.end_unit - position.start_unit, base, &cursor, limit);
        if (cursor == base and output.items.len == output_start) {
            var empty = first;
            empty.start_unit = base;
            empty.end_unit = base;
            empty.site_start_unit = base;
            try paint.append(a, &output, empty, limit);
        }
        base = cursor;
    }
    if (index != current.len) return error.InvalidTextSites;
    if (!text.changed) {
        output.deinit(a);
        output = .empty;
        try output.appendSlice(a, current);
    }
    return .{ .allocator = a, .owner = paragraph, .text_owner = text, .source_pointer = if (paragraph.character_styles) |rows| rows.ptr else null, .source_len = if (paragraph.character_styles) |rows| rows.len else 0, .original = original, .styles = try output.toOwnedSlice(a) };
}
