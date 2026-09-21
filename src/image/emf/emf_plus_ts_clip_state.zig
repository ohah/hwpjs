const std = @import("std");
const clip_rects = @import("emf_plus_ts_clip_rects.zig");

pub const State = struct {
    rectangles: []clip_rects.Rect = &.{},

    pub fn fromRects(allocator: std.mem.Allocator, source: clip_rects.Rects) !State {
        if (source.count == 0) return .{};
        const rectangles = try allocator.alloc(clip_rects.Rect, source.count);
        errdefer allocator.free(rectangles);
        var iterator = source.iterator();
        var index: usize = 0;
        while (try iterator.next()) |rectangle| : (index += 1)
            rectangles[index] = rectangle;
        std.debug.assert(index == rectangles.len);
        return .{ .rectangles = rectangles };
    }

    pub fn clone(self: State, allocator: std.mem.Allocator) !State {
        if (self.rectangles.len == 0) return .{};
        return .{ .rectangles = try allocator.dupe(clip_rects.Rect, self.rectangles) };
    }

    pub fn deinit(self: *State, allocator: std.mem.Allocator) void {
        if (self.rectangles.len != 0) allocator.free(self.rectangles);
        self.* = undefined;
    }
};

test "EMF+ terminal-server clip state owns and clones decoded rectangles" {
    const bytes = [_]u8{
        0x81, 0x82, 0x83, 0x84,
        0x85, 0x86, 0x87, 0x88,
    };
    var state = try State.fromRects(std.testing.allocator, try clip_rects.parse(&bytes, 2, true));
    defer state.deinit(std.testing.allocator);
    try std.testing.expectEqualSlices(clip_rects.Rect, &.{
        .{ .left = 1, .top = 2, .right = 3, .bottom = 6 },
        .{ .left = 6, .top = 8, .right = 10, .bottom = 16 },
    }, state.rectangles);

    var copy = try state.clone(std.testing.allocator);
    defer copy.deinit(std.testing.allocator);
    state.rectangles[0].left = 99;
    try std.testing.expectEqual(@as(i32, 1), copy.rectangles[0].left);
}

fn allocationExercise(allocator: std.mem.Allocator) !void {
    const bytes = [_]u8{ 0x81, 0x82, 0x83, 0x84 };
    var state = try State.fromRects(allocator, try clip_rects.parse(&bytes, 1, true));
    defer state.deinit(allocator);
    var copy = try state.clone(allocator);
    defer copy.deinit(allocator);
}

test "EMF+ terminal-server clip state survives every allocation failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, allocationExercise, .{});
}
