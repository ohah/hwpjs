//! Stack-first transient allocation, retaining the Zig 0.16 fallback contract.
// Adapted from Zig 0.16.0 std.heap.StackFallbackAllocator.
// The MIT License (Expat), Copyright (c) Zig contributors.
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
const std = @import("std");
const Allocator = std.mem.Allocator;
const Alignment = std.mem.Alignment;

pub fn stackFallback(comptime capacity: usize, fallback: Allocator) StackFallback(capacity) {
    return .{ .fallback = fallback };
}

pub fn StackFallback(comptime capacity: usize) type {
    return struct {
        const Self = @This();
        buffer: [capacity]u8 = undefined,
        fixed: std.heap.FixedBufferAllocator = undefined,
        fallback: Allocator,
        started: bool = false,

        // Call once after the instance reaches its final address. Do not move
        // the instance while allocations or its allocator interface are live.
        pub fn get(self: *Self) Allocator {
            std.debug.assert(!self.started);
            self.started = true;
            self.fixed = .init(&self.buffer);
            return .{ .ptr = self, .vtable = &.{ .alloc = alloc, .resize = resize, .remap = remap, .free = free } };
        }

        fn owner(self: *Self, memory: []u8) Allocator {
            return if (self.fixed.ownsPtr(memory.ptr)) self.fixed.allocator() else self.fallback;
        }

        fn alloc(context: *anyopaque, length: usize, alignment: Alignment, address: usize) ?[*]u8 {
            const self: *Self = @ptrCast(@alignCast(context));
            return self.fixed.allocator().rawAlloc(length, alignment, address) orelse self.fallback.rawAlloc(length, alignment, address);
        }

        fn resize(context: *anyopaque, memory: []u8, alignment: Alignment, length: usize, address: usize) bool {
            const self: *Self = @ptrCast(@alignCast(context));
            return self.owner(memory).rawResize(memory, alignment, length, address);
        }

        fn remap(context: *anyopaque, memory: []u8, alignment: Alignment, length: usize, address: usize) ?[*]u8 {
            const self: *Self = @ptrCast(@alignCast(context));
            return self.owner(memory).rawRemap(memory, alignment, length, address);
        }

        fn free(context: *anyopaque, memory: []u8, alignment: Alignment, address: usize) void {
            const self: *Self = @ptrCast(@alignCast(context));
            self.owner(memory).rawFree(memory, alignment, address);
        }
    };
}
