const std = @import("std");
const transform_matrix = @import("emf_plus_transform_matrix.zig");

pub const GraphicsState = struct {
    world_transform: transform_matrix.TransformMatrix = transform_matrix.TransformMatrix.identity,
};

pub const EntryKind = enum {
    save,
    container,
};

pub const Entry = struct {
    kind: EntryKind,
    stack_index: u32,
    state: GraphicsState,
};

pub const Stack = struct {
    allocator: std.mem.Allocator,
    entries: std.ArrayListUnmanaged(Entry) = .empty,
    max_depth: usize = 0,
    current: GraphicsState = .{},

    pub fn init(allocator: std.mem.Allocator) Stack {
        return .{ .allocator = allocator };
    }

    pub fn deinit(self: *Stack) void {
        self.entries.deinit(self.allocator);
        self.* = undefined;
    }

    pub fn clone(self: Stack) !Stack {
        var result = Stack.init(self.allocator);
        errdefer result.deinit();
        try result.entries.appendSlice(result.allocator, self.entries.items);
        result.max_depth = self.max_depth;
        result.current = self.current;
        return result;
    }

    pub fn push(self: *Stack, kind: EntryKind, stack_index: u32) !void {
        try self.entries.append(self.allocator, .{ .kind = kind, .stack_index = stack_index, .state = self.current });
        self.max_depth = @max(self.max_depth, self.entries.items.len);
    }

    pub fn close(self: *Stack, kind: EntryKind, stack_index: u32) !void {
        var cursor = self.entries.items.len;
        while (cursor != 0) {
            cursor -= 1;
            const entry = self.entries.items[cursor];
            if (entry.kind == kind and entry.stack_index == stack_index) {
                self.current = entry.state;
                self.entries.shrinkRetainingCapacity(cursor);
                return;
            }
        }
        return switch (kind) {
            .save => error.MissingEmfPlusSavedGraphicsState,
            .container => error.MissingEmfPlusGraphicsContainer,
        };
    }

    pub fn finish(self: Stack) !void {
        if (self.entries.items.len != 0) return error.UnclosedEmfPlusGraphicsStateStack;
    }
};

test "EMF+ Save/Restore graphics state stack closes a target and every newer mixed entry" {
    var stack = Stack.init(std.testing.allocator);
    defer stack.deinit();
    try stack.push(.save, 10);
    try stack.push(.container, 20);
    try stack.push(.save, 30);
    try std.testing.expectEqual(@as(usize, 3), stack.max_depth);
    try stack.close(.save, 10);
    try std.testing.expectEqual(@as(usize, 0), stack.entries.items.len);
    try stack.finish();
}

test "EMF+ Save/Restore graphics state stack distinguishes kinds duplicates and missing entries" {
    var stack = Stack.init(std.testing.allocator);
    defer stack.deinit();
    try stack.push(.save, 7);
    try stack.push(.container, 7);
    try stack.push(.save, 7);
    try stack.close(.save, 7);
    try std.testing.expectEqual(@as(usize, 2), stack.entries.items.len);
    try stack.close(.container, 7);
    try std.testing.expectEqual(@as(usize, 1), stack.entries.items.len);
    try std.testing.expectError(error.MissingEmfPlusGraphicsContainer, stack.close(.container, 7));
    try std.testing.expectError(error.UnclosedEmfPlusGraphicsStateStack, stack.finish());
    try stack.close(.save, 7);
    try std.testing.expectError(error.MissingEmfPlusSavedGraphicsState, stack.close(.save, 7));
}

fn allocationExercise(allocator: std.mem.Allocator) !void {
    var stack = Stack.init(allocator);
    defer stack.deinit();
    try stack.push(.save, 1);
    try stack.push(.container, 2);
    var copy = try stack.clone();
    defer copy.deinit();
    try copy.close(.save, 1);
    try copy.finish();
}

test "EMF+ Save/Restore graphics state stack survives every allocation failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, allocationExercise, .{});
}

test "EMF+ graphics state stack snapshots and restores world transform across mixed entries" {
    var stack = Stack.init(std.testing.allocator);
    defer stack.deinit();
    stack.current.world_transform = transform_matrix.TransformMatrix.translation(2, 3);
    try stack.push(.save, 1);
    stack.current.world_transform = transform_matrix.TransformMatrix.scaling(4, 5);
    try stack.push(.container, 2);
    stack.current.world_transform = transform_matrix.TransformMatrix.rotation(90);
    try stack.close(.save, 1);
    try std.testing.expectEqualDeep(transform_matrix.TransformMatrix.translation(2, 3), stack.current.world_transform);
    try stack.finish();
}
