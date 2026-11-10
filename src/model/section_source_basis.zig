//! Sole owned current section source basis. Format parsing belongs to HWP5.
const std = @import("std");

pub const Basis = struct {
    bytes: []u8,
    style_offsets: []usize,
    original_record_count: usize,

    pub fn deinit(self: *Basis, a: std.mem.Allocator) void {
        a.free(self.bytes);
        a.free(self.style_offsets);
        self.* = undefined;
    }

    pub fn clone(self: Basis, a: std.mem.Allocator) !Basis {
        const bytes = try a.dupe(u8, self.bytes);
        errdefer a.free(bytes);
        const offsets = try a.dupe(usize, self.style_offsets);
        return .{ .bytes = bytes, .style_offsets = offsets, .original_record_count = self.original_record_count };
    }

    /// Inline storage is already charged through Section; count owned arrays only.
    pub fn byteSize(self: Basis) error{LimitExceeded}!usize {
        const offsets = std.math.mul(usize, self.style_offsets.len, @sizeOf(usize)) catch return error.LimitExceeded;
        return std.math.add(usize, self.bytes.len, offsets) catch return error.LimitExceeded;
    }
};
