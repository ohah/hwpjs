//! Owned model values for undo. Immutable format sidecars stay in Session.
const std = @import("std");
const model = @import("../../model/document.zig");
const clone = @import("../../model/clone.zig");

const State = struct {
    allocator: std.mem.Allocator,
    owner: *const anyopaque,
    document: model.Document,
    max_bytes: usize,
};

/// Opaque to avoid exposing mutable copies as a second public document model.
/// Must be released before its originating Session is closed.
pub const Checkpoint = opaque {
    pub fn deinit(self: *Checkpoint) void {
        const state: *State = @ptrCast(@alignCast(self));
        const a = state.allocator;
        state.document.deinit(a);
        a.destroy(state);
    }
};

pub fn capture(a: std.mem.Allocator, owner: *const anyopaque, source: *const model.Document, max_bytes: usize) !*Checkpoint {
    _ = try size(source, max_bytes);
    const sections = try a.alloc(model.Section, source.sections.len);
    var initialized: usize = 0;
    errdefer {
        for (sections[0..initialized]) |*section| section.deinit(a);
        a.free(sections);
    }
    for (source.sections, sections) |section, *out| {
        out.* = try clone.section(a, section);
        initialized += 1;
    }
    const state = try a.create(State);
    state.* = .{ .allocator = a, .owner = owner, .document = .{ .format = source.format, .coverage = source.coverage, .sections = sections }, .max_bytes = max_bytes };
    return @ptrCast(state);
}

/// Allocation-free swap, retaining replaced values for redo.
pub fn exchange(checkpoint: *Checkpoint, a: std.mem.Allocator, owner: *const anyopaque, current: *model.Document) !void {
    const state: *State = @ptrCast(@alignCast(checkpoint));
    try bind(state, a, owner, current);
    _ = try size(current, state.max_bytes);
    std.mem.swap(model.Document, &state.document, current);
}

pub fn matches(checkpoint: *const Checkpoint, a: std.mem.Allocator, owner: *const anyopaque, current: *const model.Document) !bool {
    const state: *const State = @ptrCast(@alignCast(checkpoint));
    try bind(state, a, owner, current);
    return @import("../../model/equality.zig").document(state.document, current.*);
}

/// Transaction rollback validates the preserved destination, not rejected growth.
pub fn rollback(checkpoint: *Checkpoint, a: std.mem.Allocator, owner: *const anyopaque, current: *model.Document) !void {
    const state: *State = @ptrCast(@alignCast(checkpoint));
    try bind(state, a, owner, current);
    _ = try size(&state.document, state.max_bytes);
    std.mem.swap(model.Document, &state.document, current);
}

fn bind(state: *const State, a: std.mem.Allocator, owner: *const anyopaque, current: *const model.Document) !void {
    if (state.owner != owner or state.allocator.ptr != a.ptr or state.allocator.vtable != a.vtable or state.document.format != current.format or state.document.coverage != current.coverage or state.document.sections.len != current.sections.len) return error.SourceBindingMismatch;
    for (state.document.sections, current.sections) |before, after| {
        if (before.source_record_count != after.source_record_count) return error.SourceBindingMismatch;
        try validateProvenance(before);
        try validateProvenance(after);
    }
}

fn validateProvenance(section: model.Section) !void {
    for (section.paragraphs) |p| {
        if (p.parent_node) |parent| if (parent >= section.source_record_count) return error.SourceBindingMismatch;
        if (p.source_node) |node| {
            if (node >= section.source_record_count or p.header_template != null) return error.SourceBindingMismatch;
        } else {
            const template = p.header_template orelse return error.SourceBindingMismatch;
            if (template >= section.source_record_count or p.instance_id == 0) return error.SourceBindingMismatch;
        }
    }
}

pub fn size(document: *const model.Document, limit: usize) !usize {
    var total: usize = 0;
    try add(&total, 1, @sizeOf(State), limit);
    try add(&total, document.sections.len, @sizeOf(model.Section), limit);
    for (document.sections) |section| {
        try add(&total, section.paragraphs.len, @sizeOf(model.Paragraph), limit);
        for (section.paragraphs) |paragraph| {
            try add(&total, paragraph.tokens.len, @sizeOf(model.Token), limit);
            for (paragraph.tokens) |token| try add(&total, token.raw.len, 1, limit);
            try add(&total, paragraph.character_runs.len, @sizeOf(model.CharacterRun), limit);
            if (paragraph.range_tags) |values| try add(&total, values.len, @sizeOf(model.TextRange), limit);
            if (paragraph.field_attributes) |values| try add(&total, values.len, @sizeOf(model.FieldAttributes), limit);
            if (paragraph.formula_results) |values| try add(&total, values.len, @sizeOf(model.FormulaResult), limit);
        }
    }
    return total;
}
fn add(total: *usize, count: usize, width: usize, limit: usize) !void {
    const amount = std.math.mul(usize, count, width) catch return error.LimitExceeded;
    if (amount > limit -| total.*) return error.LimitExceeded;
    total.* += amount;
}
