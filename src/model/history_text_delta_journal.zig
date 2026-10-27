//! 전체 문단 대신 변경된 UTF-16 단위만 소유한다. 저장소/서식 연결은 별도다.
const std = @import("std");
const epochs = @import("history_mutation_epoch.zig");
pub const Range = struct { owner: u64, start: usize };
pub const Edit = struct { range: Range, remove: []const u16, insert: []const u16 };
pub const State = enum { prepared, applied, undone };
pub const Record = struct {
    allocator: std.mem.Allocator,
    binding: epochs.Binding,
    range: Range,
    removed: []u16,
    inserted: []u16,
    state: State = .prepared,
    pub fn prepare(a: std.mem.Allocator, binding: epochs.Binding, edit: Edit, max_delta_bytes: usize) !Record {
        if (edit.range.owner != binding.owner) return error.SourceBindingMismatch;
        _ = std.math.add(usize, edit.range.start, edit.remove.len) catch return error.InvalidTextPosition;
        _ = std.math.add(usize, edit.range.start, edit.insert.len) catch return error.InvalidTextPosition;
        const count = std.math.add(usize, edit.remove.len, edit.insert.len) catch return error.DeltaLimitExceeded;
        const bytes = std.math.mul(usize, count, @sizeOf(u16)) catch return error.DeltaLimitExceeded;
        if (bytes > max_delta_bytes) return error.DeltaLimitExceeded;
        const removed = try a.dupe(u16, edit.remove);
        errdefer a.free(removed);
        const inserted = try a.dupe(u16, edit.insert);
        return .{ .allocator = a, .binding = binding, .range = edit.range, .removed = removed, .inserted = inserted };
    }
    pub fn deinit(self: *Record) void {
        self.allocator.free(self.removed);
        self.allocator.free(self.inserted);
        self.* = undefined;
    }
    /// 요청 할당 크기다. 외부 meter/arena의 backing·record allocation은 별도로 합산한다.
    pub fn dataBytes(self: *const Record) usize {
        return (self.removed.len + self.inserted.len) * @sizeOf(u16);
    }
    pub fn forward(self: *const Record) !Edit {
        if (self.state == .applied) return error.InvalidJournalTransition;
        return .{ .range = self.range, .remove = self.removed, .insert = self.inserted };
    }
    pub fn inverse(self: *const Record) !Edit {
        if (self.state != .applied) return error.InvalidJournalTransition;
        return .{ .range = self.range, .remove = self.inserted, .insert = self.removed };
    }
    /// Native 저장소의 원자 commit 성공 뒤에만 호출한다.
    pub fn markApplied(self: *Record) !void {
        if (self.state == .applied) return error.InvalidJournalTransition;
        self.state = .applied;
    }
    pub fn markUndone(self: *Record) !void {
        if (self.state != .applied) return error.InvalidJournalTransition;
        self.state = .undone;
    }
};
