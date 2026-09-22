const std = @import("std");
const transform_matrix = @import("emf_plus_transform_matrix.zig");
const page_transform = @import("emf_plus_page_transform.zig");
const clip_state = @import("emf_plus_clip_state.zig");
const property_state = @import("emf_plus_property_state.zig");
const ts_clip_state = @import("emf_plus_ts_clip_state.zig");
const ts_clip_rects = @import("emf_plus_ts_clip_rects.zig");
const ts_graphics_state = @import("emf_plus_ts_graphics_state.zig");
const set_ts_graphics = @import("emf_plus_set_ts_graphics.zig");
const palette_data = @import("emf_plus_palette.zig");
const combine_mode = @import("emf_plus_combine_mode.zig");
const geometry = @import("emf_plus_geometry.zig");
const world_page_device = @import("emf_plus_world_page_device.zig");

pub const GraphicsState = struct {
    world_transform: ?transform_matrix.TransformMatrix = transform_matrix.TransformMatrix.identity,
    page_transform: page_transform.PageTransform = .{},
    clip: clip_state.State = .infinite,
    properties: property_state.State = .{},
    terminal_server_clip: ?ts_clip_state.State = null,
    terminal_server_graphics: ?ts_graphics_state.State = null,

    pub fn mapWorldPagePointToDevice(self: GraphicsState, point: geometry.PointF) ?geometry.PointF {
        return world_page_device.mapPoint(self.world_transform, self.page_transform, point);
    }

    pub fn clone(self: GraphicsState, allocator: std.mem.Allocator) !GraphicsState {
        var result = self;
        result.terminal_server_clip = null;
        result.terminal_server_graphics = null;
        errdefer result.deinit(allocator);
        result.terminal_server_clip = if (self.terminal_server_clip) |state| try state.clone(allocator) else null;
        result.terminal_server_graphics = if (self.terminal_server_graphics) |state| try state.clone(allocator) else null;
        return result;
    }

    pub fn deinit(self: *GraphicsState, allocator: std.mem.Allocator) void {
        if (self.terminal_server_clip) |*state| state.deinit(allocator);
        if (self.terminal_server_graphics) |*state| state.deinit(allocator);
        self.* = undefined;
    }

    pub fn setTerminalServerClip(self: *GraphicsState, allocator: std.mem.Allocator, rectangles: ts_clip_rects.Rects) !void {
        var replacement = try ts_clip_state.State.fromRects(allocator, rectangles);
        errdefer replacement.deinit(allocator);
        self.clearTerminalServerClip(allocator);
        self.terminal_server_clip = replacement;
    }

    pub fn clearTerminalServerClip(self: *GraphicsState, allocator: std.mem.Allocator) void {
        if (self.terminal_server_clip) |*state| state.deinit(allocator);
        self.terminal_server_clip = null;
    }

    pub fn setTerminalServerGraphics(self: *GraphicsState, allocator: std.mem.Allocator, parsed: set_ts_graphics.SetTSGraphics) !void {
        var replacement = try ts_graphics_state.State.fromParsed(allocator, parsed);
        errdefer replacement.deinit(allocator);
        if (self.terminal_server_graphics) |*state| state.deinit(allocator);
        self.terminal_server_graphics = replacement;
    }

    pub fn resetClip(self: *GraphicsState, allocator: std.mem.Allocator) void {
        self.clearTerminalServerClip(allocator);
        self.clip = .infinite;
    }

    pub fn combineClipRectangle(self: *GraphicsState, allocator: std.mem.Allocator, mode: combine_mode.CombineMode, rectangle: geometry.RectF) void {
        self.clearTerminalServerClip(allocator);
        self.clip = self.clip.combineRectangle(mode, rectangle);
    }

    pub fn combineClipOpaque(self: *GraphicsState, allocator: std.mem.Allocator, mode: combine_mode.CombineMode) void {
        self.clearTerminalServerClip(allocator);
        self.clip = self.clip.combineOpaque(mode);
    }

    pub fn offsetClip(self: *GraphicsState, allocator: std.mem.Allocator, dx: f32, dy: f32) void {
        self.clearTerminalServerClip(allocator);
        self.clip = self.clip.offset(dx, dy);
    }
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
        self.current.deinit(self.allocator);
        for (self.entries.items) |*entry| entry.state.deinit(self.allocator);
        self.entries.deinit(self.allocator);
        self.* = undefined;
    }

    pub fn clone(self: Stack) !Stack {
        var result = Stack.init(self.allocator);
        errdefer result.deinit();
        try result.entries.ensureTotalCapacity(result.allocator, self.entries.items.len);
        for (self.entries.items) |entry| {
            const state = try entry.state.clone(result.allocator);
            result.entries.appendAssumeCapacity(.{ .kind = entry.kind, .stack_index = entry.stack_index, .state = state });
        }
        result.max_depth = self.max_depth;
        result.current = try self.current.clone(result.allocator);
        return result;
    }

    pub fn push(self: *Stack, kind: EntryKind, stack_index: u32) !void {
        const state = try self.current.clone(self.allocator);
        errdefer {
            var pending = state;
            pending.deinit(self.allocator);
        }
        try self.entries.append(self.allocator, .{ .kind = kind, .stack_index = stack_index, .state = state });
        self.max_depth = @max(self.max_depth, self.entries.items.len);
    }

    pub fn close(self: *Stack, kind: EntryKind, stack_index: u32) !void {
        var cursor = self.entries.items.len;
        while (cursor != 0) {
            cursor -= 1;
            const entry = self.entries.items[cursor];
            if (entry.kind == kind and entry.stack_index == stack_index) {
                self.current.deinit(self.allocator);
                for (self.entries.items[cursor + 1 ..]) |*newer| newer.state.deinit(self.allocator);
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

fn terminalServerClipAllocationExercise(allocator: std.mem.Allocator) !void {
    const bytes = [_]u8{ 0x81, 0x82, 0x83, 0x84 };
    var stack = Stack.init(allocator);
    defer stack.deinit();
    try stack.current.setTerminalServerClip(allocator, try ts_clip_rects.parse(&bytes, 1, true));
    try stack.push(.save, 1);
    var copy = try stack.clone();
    defer copy.deinit();
    try copy.close(.save, 1);
}

test "EMF+ graphics state stack owns terminal-server clip through every allocation failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, terminalServerClipAllocationExercise, .{});
}

test "EMF+ ordinary clip transitions discard stale terminal-server rectangles" {
    const bytes = [_]u8{ 0x81, 0x82, 0x83, 0x84 };
    const rectangles = try ts_clip_rects.parse(&bytes, 1, true);
    var state: GraphicsState = .{};
    defer state.deinit(std.testing.allocator);

    try state.setTerminalServerClip(std.testing.allocator, rectangles);
    state.resetClip(std.testing.allocator);
    try std.testing.expect(state.terminal_server_clip == null);
    try std.testing.expectEqual(clip_state.State.infinite, state.clip);

    try state.setTerminalServerClip(std.testing.allocator, rectangles);
    state.combineClipRectangle(std.testing.allocator, .replace, .{ .x = 1, .y = 2, .width = 3, .height = 4 });
    try std.testing.expect(state.terminal_server_clip == null);
    try std.testing.expectEqual(clip_state.State.complex, state.clip);

    try state.setTerminalServerClip(std.testing.allocator, rectangles);
    state.combineClipOpaque(std.testing.allocator, .intersect);
    try std.testing.expect(state.terminal_server_clip == null);
    try std.testing.expectEqual(clip_state.State.complex, state.clip);

    try state.setTerminalServerClip(std.testing.allocator, rectangles);
    state.offsetClip(std.testing.allocator, 5, 6);
    try std.testing.expect(state.terminal_server_clip == null);
    try std.testing.expectEqual(clip_state.State.complex, state.clip);
}

test "EMF+ terminal-server clip transitions release owned bytes in every build mode" {
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    const allocator = checked.allocator();
    const bytes = [_]u8{ 0x81, 0x82, 0x83, 0x84 };
    var state: GraphicsState = .{};
    defer state.deinit(allocator);
    try state.setTerminalServerClip(allocator, try ts_clip_rects.parse(&bytes, 1, true));
    state.resetClip(allocator);
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}

test "EMF+ terminal-server clip stack snapshots release every owned copy in every build mode" {
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    const allocator = checked.allocator();
    const first = [_]u8{ 0x81, 0x82, 0x83, 0x84 };
    const second = [_]u8{ 0x85, 0x86, 0x87, 0x88 };
    {
        var stack = Stack.init(allocator);
        defer stack.deinit();
        try stack.current.setTerminalServerClip(allocator, try ts_clip_rects.parse(&first, 1, true));
        try stack.push(.save, 1);
        try stack.current.setTerminalServerClip(allocator, try ts_clip_rects.parse(&second, 1, true));
        try stack.push(.container, 2);
        var copy = try stack.clone();
        defer copy.deinit();
        try stack.close(.save, 1);
        try std.testing.expectEqual(@as(i32, 1), stack.current.terminal_server_clip.?.rectangles[0].left);
    }
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}

fn terminalServerGraphicsValue(entry_bytes: []const u8, origin: i16) set_ts_graphics.SetTSGraphics {
    return .{
        .flags = 1,
        .basic_vga = false,
        .anti_alias_mode = .anti_alias_8x8,
        .text_render_hint = .clear_type_grid_fit,
        .compositing_mode = .source_copy,
        .compositing_quality = .assume_linear,
        .render_origin_x = origin,
        .render_origin_y = 9,
        .text_contrast = 12,
        .filter_type = .gaussian_quad,
        .pixel_offset = .half,
        .world_to_device = .{ .m11 = 1, .m12 = 2, .m21 = 3, .m22 = 4, .dx = 5, .dy = 6 },
        .palette = palette_data.Palette{ .style = @bitCast(@as(u32, 0)), .count = 1, .entry_bytes = entry_bytes },
    };
}

test "EMF+ terminal-server graphics stack releases palette snapshots in every build mode" {
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    const allocator = checked.allocator();
    const first = [_]u8{ 1, 2, 3, 4 };
    const second = [_]u8{ 5, 6, 7, 8 };
    {
        var stack = Stack.init(allocator);
        defer stack.deinit();
        try stack.current.setTerminalServerGraphics(allocator, terminalServerGraphicsValue(&first, 1));
        try stack.push(.save, 1);
        try stack.current.setTerminalServerGraphics(allocator, terminalServerGraphicsValue(&second, 2));
        try stack.push(.container, 2);
        var copy = try stack.clone();
        defer copy.deinit();
        try stack.close(.save, 1);
        try std.testing.expect(stack.current.terminal_server_graphics != null);
        try std.testing.expectEqual(@as(i16, 1), stack.current.terminal_server_graphics.?.summary.render_origin_x);
        try std.testing.expect(stack.current.terminal_server_graphics.?.palette != null);
        try std.testing.expectEqual(@as(u8, 1), stack.current.terminal_server_graphics.?.palette.?.entry_bytes[0]);
    }
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}

test "EMF+ graphics state stack snapshots and restores world transform across mixed entries" {
    var stack = Stack.init(std.testing.allocator);
    defer stack.deinit();
    stack.current.world_transform = transform_matrix.TransformMatrix.translation(2, 3);
    stack.current.page_transform = page_transform.build(.inch, 2, .{ .x = 96, .y = 120 });
    stack.current.clip = .complex;
    stack.current.properties.text_contrast = 1200;
    try stack.push(.save, 1);
    stack.current.world_transform = transform_matrix.TransformMatrix.scaling(4, 5);
    stack.current.page_transform = page_transform.build(.pixel, 3, .{ .x = 96, .y = 120 });
    stack.current.clip = .empty;
    stack.current.properties.text_contrast = 1800;
    try stack.push(.container, 2);
    stack.current.world_transform = transform_matrix.TransformMatrix.rotation(90);
    try stack.close(.save, 1);
    try std.testing.expectEqualDeep(transform_matrix.TransformMatrix.translation(2, 3), stack.current.world_transform.?);
    try std.testing.expectEqualDeep(page_transform.build(.inch, 2, .{ .x = 96, .y = 120 }), stack.current.page_transform);
    try std.testing.expectEqual(clip_state.State.complex, stack.current.clip);
    try std.testing.expectEqual(@as(u12, 1200), stack.current.properties.text_contrast.?);
    try stack.finish();
}

test "EMF+ graphics state exposes the shared world-page-device point mapping" {
    const state: GraphicsState = .{
        .world_transform = transform_matrix.TransformMatrix.translation(10, 20),
        .page_transform = page_transform.build(.inch, 2, .{ .x = 5, .y = 50 }),
    };
    const device = state.mapWorldPagePointToDevice(.{ .x = 1, .y = 2 }).?;
    try std.testing.expectEqual(@as(f32, 110), device.x);
    try std.testing.expectEqual(@as(f32, 2200), device.y);
}
