//! Per-instance lifetime binding only. Does not own any document/projection cache.
const std = @import("std");
const m = @import("formatting_patch.zig");
pub const State = struct {
    epoch: u64 = 0,
    opened: bool = false,
    /// Call only after successful open/unlock. Exhaustion must not wrap/reuse IDs.
    pub fn open(self: *State) !void {
        self.opened = false;
        self.epoch = std.math.add(u64, self.epoch, 1) catch return error.FormattingBindingExhausted;
        self.opened = true;
    }
    pub fn next(self: State) !State {
        var value = self;
        try value.open();
        return value;
    }
    pub fn close(self: *State) void {
        self.opened = false;
    }
    pub fn session(self: State, a: std.mem.Allocator) ![]u8 {
        if (!self.opened) return error.EditorNotOpen;
        return std.fmt.allocPrint(a, "s{d}", .{self.epoch});
    }
    pub fn check(self: State, binding: m.Binding, current_revision: ?u32) !void {
        if (!self.opened) return error.EditorNotOpen;
        var buffer: [32]u8 = undefined;
        const expected = try std.fmt.bufPrint(&buffer, "s{d}", .{self.epoch});
        if (!std.mem.eql(u8, expected, binding.session) or current_revision != binding.revision) return error.StaleFormattingBinding;
    }
    /// Owner must already have been resolved and validated from live Native data.
    pub fn reference(self: State, a: std.mem.Allocator, owner: m.Owner) ![]u8 {
        if (!self.opened) return error.EditorNotOpen;
        return std.fmt.allocPrint(a, "p{d}:{d}:{d}", .{ self.epoch, owner.section, owner.paragraph });
    }
    /// This parses a coordinate, not an ownership proof. The caller MUST resolve
    /// it against the current Native SSOT and reject generated/invalid owners.
    pub fn coordinate(self: State, ref: []const u8) !m.Owner {
        if (!self.opened) return error.EditorNotOpen;
        var parts = std.mem.splitScalar(u8, ref, ':');
        const epoch = parts.next() orelse return error.InvalidFormattingReference;
        if (epoch.len < 2 or epoch[0] != 'p') return error.InvalidFormattingReference;
        if (try decimal(epoch[1..]) != self.epoch) return error.StaleFormattingBinding;
        const section = try decimal(parts.next() orelse return error.InvalidFormattingReference);
        const paragraph = try decimal(parts.next() orelse return error.InvalidFormattingReference);
        if (parts.next() != null or section > std.math.maxInt(u32) or paragraph > std.math.maxInt(u32)) return error.InvalidFormattingReference;
        return .{ .section = @intCast(section), .paragraph = @intCast(paragraph) };
    }
};
fn decimal(text: []const u8) !u64 {
    if (text.len == 0 or (text.len > 1 and text[0] == '0')) return error.InvalidFormattingReference;
    for (text) |c| if (!std.ascii.isDigit(c)) return error.InvalidFormattingReference;
    return std.fmt.parseInt(u64, text, 10) catch error.InvalidFormattingReference;
}
