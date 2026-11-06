//! One checkpoint for the partial document and adapter-owned generated tables.
const std = @import("std");
const model = @import("../../model/document.zig");
const base = @import("editor_checkpoint.zig");
const Values = @import("created_table_values.zig").Values;
const Backgrounds = @import("cell_background_values.zig").Values;
const State = struct {
    allocator: std.mem.Allocator,
    owner: *const anyopaque,
    document: *base.Checkpoint,
    document_bytes: usize,
    tables: []Values,
    backgrounds: Backgrounds,
    limit: usize,
};
pub const Checkpoint = opaque {
    pub fn deinit(self: *Checkpoint) void {
        const state: *State = @ptrCast(@alignCast(self));
        const a = state.allocator;
        state.document.deinit();
        for (state.tables) |*tables| tables.deinit(a);
        a.free(state.tables);
        state.backgrounds.deinit(a);
        a.destroy(state);
    }
};

fn total(document_bytes: usize, tables: []const Values, backgrounds: Backgrounds, limit: usize) !usize {
    var result = std.math.add(usize, document_bytes, try backgrounds.byteSize()) catch return error.LimitExceeded;
    result = std.math.add(usize, result, @sizeOf(State)) catch return error.LimitExceeded;
    const slots = std.math.mul(usize, tables.len, @sizeOf(Values)) catch return error.LimitExceeded;
    result = std.math.add(usize, result, slots) catch return error.LimitExceeded;
    if (result > limit) return error.LimitExceeded;
    for (tables) |table| {
        const bytes = try table.byteSize(limit - result);
        result += bytes;
    }
    return result;
}

pub fn sizeWithCells(document: *const model.Document, tables: []const Values, backgrounds: Backgrounds, limit: usize) !usize {
    if (tables.len != document.sections.len) return error.SourceBindingMismatch;
    return total(try base.size(document, limit), tables, backgrounds, limit);
}

pub fn captureWithCells(a: std.mem.Allocator, owner: *const anyopaque, document: *const model.Document, tables: []const Values, backgrounds: Backgrounds, limit: usize) !*Checkpoint {
    _ = try sizeWithCells(document, tables, backgrounds, limit);
    const document_bytes = try base.size(document, limit);
    const snapshot = try base.capture(a, owner, document, limit);
    errdefer snapshot.deinit();
    const copies = try a.alloc(Values, tables.len);
    var initialized: usize = 0;
    errdefer {
        for (copies[0..initialized]) |*table| table.deinit(a);
        a.free(copies);
    }
    for (tables, copies) |table, *out| {
        out.* = try table.clone(a, limit);
        initialized += 1;
    }
    var background_copy = try backgrounds.clone(a);
    errdefer background_copy.deinit(a);
    const state = try a.create(State);
    state.* = .{ .allocator = a, .owner = owner, .document = snapshot, .document_bytes = document_bytes, .tables = copies, .backgrounds = background_copy, .limit = limit };
    return @ptrCast(state);
}

/// Immutable stored snapshot -> new Parent-owned values. Never transfer its arena.
pub fn cloneTo(checkpoint: *const Checkpoint, a: std.mem.Allocator, owner: *const anyopaque, limit: usize) !*Checkpoint {
    const state: *const State = @ptrCast(@alignCast(checkpoint));
    if (state.owner != owner) return error.SourceBindingMismatch;
    const document = try base.cloneTo(state.document, a, owner, limit);
    errdefer document.deinit();
    const tables = try a.alloc(Values, state.tables.len);
    var initialized: usize = 0;
    errdefer {
        for (tables[0..initialized]) |*value| value.deinit(a);
        a.free(tables);
    }
    for (state.tables, tables) |*source, *target| {
        target.* = try source.clone(a, limit);
        initialized += 1;
    }
    _ = try total(state.document_bytes, tables, state.backgrounds, limit);
    var backgrounds = try state.backgrounds.clone(a);
    errdefer backgrounds.deinit(a);
    const out = try a.create(State);
    out.* = .{ .allocator = a, .owner = owner, .document = document, .document_bytes = state.document_bytes, .tables = tables, .backgrounds = backgrounds, .limit = limit };
    return @ptrCast(out);
}

fn bind(state: *const State, a: std.mem.Allocator, owner: *const anyopaque, document: *const model.Document, tables: []const Values) !void {
    if (state.owner != owner or state.allocator.ptr != a.ptr or state.allocator.vtable != a.vtable or tables.len != state.tables.len or tables.len != document.sections.len) return error.SourceBindingMismatch;
}

pub fn matchesWithCells(checkpoint: *const Checkpoint, a: std.mem.Allocator, owner: *const anyopaque, document: *const model.Document, tables: []const Values, backgrounds: Backgrounds) !bool {
    const state: *const State = @ptrCast(@alignCast(checkpoint));
    try bind(state, a, owner, document, tables);
    if (!state.backgrounds.equals(backgrounds)) return false;
    if (!try base.matches(state.document, a, owner, document)) return false;
    for (state.tables, tables) |*left, *right| if (!left.equals(right)) return false;
    return true;
}

pub fn exchangeWithCells(checkpoint: *Checkpoint, a: std.mem.Allocator, owner: *const anyopaque, document: *model.Document, tables: *[]Values, backgrounds: *Backgrounds) !void {
    const state: *State = @ptrCast(@alignCast(checkpoint));
    try bind(state, a, owner, document, tables.*);
    _ = try sizeWithCells(document, tables.*, backgrounds.*, state.limit);
    const bytes = try base.size(document, state.limit);
    try base.exchange(state.document, a, owner, document);
    std.mem.swap([]Values, &state.tables, tables);
    std.mem.swap(Backgrounds, &state.backgrounds, backgrounds);
    state.document_bytes = bytes;
}

pub fn rollbackWithCells(checkpoint: *Checkpoint, a: std.mem.Allocator, owner: *const anyopaque, document: *model.Document, tables: *[]Values, backgrounds: *Backgrounds) !void {
    const state: *State = @ptrCast(@alignCast(checkpoint));
    try bind(state, a, owner, document, tables.*);
    _ = try total(state.document_bytes, state.tables, state.backgrounds, state.limit);
    const bytes = base.size(document, std.math.maxInt(usize)) catch std.math.maxInt(usize);
    try base.rollback(state.document, a, owner, document);
    std.mem.swap([]Values, &state.tables, tables);
    std.mem.swap(Backgrounds, &state.backgrounds, backgrounds);
    state.document_bytes = bytes;
}

// Existing generated-table callers retain their empty-cell-state API.
pub fn size(document: *const model.Document, tables: []const Values, limit: usize) !usize {
    return sizeWithCells(document, tables, .{}, limit);
}
pub fn capture(a: std.mem.Allocator, owner: *const anyopaque, document: *const model.Document, tables: []const Values, limit: usize) !*Checkpoint {
    return captureWithCells(a, owner, document, tables, .{}, limit);
}
pub fn matches(checkpoint: *const Checkpoint, a: std.mem.Allocator, owner: *const anyopaque, document: *const model.Document, tables: []const Values) !bool {
    return matchesWithCells(checkpoint, a, owner, document, tables, .{});
}
pub fn exchange(checkpoint: *Checkpoint, a: std.mem.Allocator, owner: *const anyopaque, document: *model.Document, tables: *[]Values) !void {
    const state: *State = @ptrCast(@alignCast(checkpoint));
    if (state.backgrounds.entries.len != 0) return error.SourceBindingMismatch;
    var empty: Backgrounds = .{};
    return exchangeWithCells(checkpoint, a, owner, document, tables, &empty);
}
pub fn rollback(checkpoint: *Checkpoint, a: std.mem.Allocator, owner: *const anyopaque, document: *model.Document, tables: *[]Values) !void {
    const state: *State = @ptrCast(@alignCast(checkpoint));
    if (state.backgrounds.entries.len != 0) return error.SourceBindingMismatch;
    var empty: Backgrounds = .{};
    return rollbackWithCells(checkpoint, a, owner, document, tables, &empty);
}
