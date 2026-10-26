//! One checkpoint for the partial document and adapter-owned generated tables.
const std = @import("std");
const model = @import("../../model/document.zig");
const base = @import("editor_checkpoint.zig");
const Values = @import("created_table_values.zig").Values;
const State = struct {
    allocator: std.mem.Allocator,
    owner: *const anyopaque,
    document: *base.Checkpoint,
    document_bytes: usize,
    tables: []Values,
    limit: usize,
};
pub const Checkpoint = opaque {
    pub fn deinit(self: *Checkpoint) void {
        const state: *State = @ptrCast(@alignCast(self));
        const a = state.allocator;
        state.document.deinit();
        for (state.tables) |*tables| tables.deinit(a);
        a.free(state.tables);
        a.destroy(state);
    }
};

fn total(document_bytes: usize, tables: []const Values, limit: usize) !usize {
    var result = document_bytes;
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

pub fn size(document: *const model.Document, tables: []const Values, limit: usize) !usize {
    if (tables.len != document.sections.len) return error.SourceBindingMismatch;
    return total(try base.size(document, limit), tables, limit);
}

pub fn capture(a: std.mem.Allocator, owner: *const anyopaque, document: *const model.Document, tables: []const Values, limit: usize) !*Checkpoint {
    _ = try size(document, tables, limit);
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
    const state = try a.create(State);
    state.* = .{ .allocator = a, .owner = owner, .document = snapshot, .document_bytes = document_bytes, .tables = copies, .limit = limit };
    return @ptrCast(state);
}

fn bind(state: *const State, a: std.mem.Allocator, owner: *const anyopaque, document: *const model.Document, tables: []const Values) !void {
    if (state.owner != owner or state.allocator.ptr != a.ptr or state.allocator.vtable != a.vtable or tables.len != state.tables.len or tables.len != document.sections.len) return error.SourceBindingMismatch;
}

pub fn matches(checkpoint: *const Checkpoint, a: std.mem.Allocator, owner: *const anyopaque, document: *const model.Document, tables: []const Values) !bool {
    const state: *const State = @ptrCast(@alignCast(checkpoint));
    try bind(state, a, owner, document, tables);
    if (!try base.matches(state.document, a, owner, document)) return false;
    for (state.tables, tables) |*left, *right| if (!left.equals(right)) return false;
    return true;
}

pub fn exchange(checkpoint: *Checkpoint, a: std.mem.Allocator, owner: *const anyopaque, document: *model.Document, tables: *[]Values) !void {
    const state: *State = @ptrCast(@alignCast(checkpoint));
    try bind(state, a, owner, document, tables.*);
    _ = try size(document, tables.*, state.limit);
    const bytes = try base.size(document, state.limit);
    try base.exchange(state.document, a, owner, document);
    std.mem.swap([]Values, &state.tables, tables);
    state.document_bytes = bytes;
}

pub fn rollback(checkpoint: *Checkpoint, a: std.mem.Allocator, owner: *const anyopaque, document: *model.Document, tables: *[]Values) !void {
    const state: *State = @ptrCast(@alignCast(checkpoint));
    try bind(state, a, owner, document, tables.*);
    _ = try total(state.document_bytes, state.tables, state.limit);
    const bytes = base.size(document, std.math.maxInt(usize)) catch std.math.maxInt(usize);
    try base.rollback(state.document, a, owner, document);
    std.mem.swap([]Values, &state.tables, tables);
    state.document_bytes = bytes;
}
