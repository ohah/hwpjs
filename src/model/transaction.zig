//! Synchronous section transaction. The callback may mutate only its draft.
const std = @import("std");
const model = @import("document.zig");
pub const SectionDraft = struct { index: usize, section: model.Section };

/// Atomic multi-section edit. Indices must be unique and strictly increasing.
pub fn applyMany(a: std.mem.Allocator, targets: []model.Section, indices: []const usize, context: anytype, comptime prepare: anytype) !void {
    for (indices, 0..) |index, i| {
        if (index >= targets.len or (i > 0 and indices[i - 1] >= index)) return error.SourceBindingMismatch;
    }
    const drafts = try a.alloc(SectionDraft, indices.len);
    defer a.free(drafts);
    var initialized: usize = 0;
    defer for (drafts[0..initialized]) |*draft| draft.section.deinit(a);
    for (indices, drafts) |index, *draft| {
        draft.* = .{ .index = index, .section = try @import("clone.zig").section(a, targets[index]) };
        initialized += 1;
    }
    try prepare(a, drafts, context);
    // Every preparation succeeded. Swaps and old-state destruction cannot fail.
    for (drafts) |*draft| std.mem.swap(model.Section, &targets[draft.index], &draft.section);
}

/// Target and all its buffers must belong to `a`. No concurrent mutation is
/// allowed; context must not mutate target or retain pointers into the draft.
/// The callback prepares every dependent value before returning success.
pub fn apply(a: std.mem.Allocator, target: *model.Section, context: anytype, comptime prepare: anytype) !void {
    var draft = try @import("clone.zig").section(a, target.*);
    errdefer draft.deinit(a);
    try prepare(a, &draft, context);
    // No allocations or other fallible operations beyond the commit boundary.
    var previous = target.*;
    target.* = draft;
    previous.deinit(a);
}

test "HWP5 multi section transaction prepares all drafts before commit including late failure" {
    const Context = struct {
        refuse: bool,
        fn prepare(a: std.mem.Allocator, drafts: []SectionDraft, self: @This()) !void {
            for (drafts) |*draft| {
                try @import("form_values.zig").upsertField(a, &draft.section.form_values, @intCast(draft.index + 1), .value, &.{ '1', 0 }, &.{ '0', 0 }, 1024);
            }
            if (self.refuse) return error.PreparationRefused;
        }
    };
    const Run = struct {
        fn run(a: std.mem.Allocator) !void {
            var sections = [_]model.Section{ .{ .paragraphs = &.{}, .source_record_count = 3 }, .{ .paragraphs = &.{}, .source_record_count = 3 } };
            defer for (&sections) |*section| section.deinit(a);
            try std.testing.expectError(error.SourceBindingMismatch, applyMany(a, &sections, &.{ 1, 0 }, Context{ .refuse = false }, Context.prepare));
            try std.testing.expectError(error.SourceBindingMismatch, applyMany(a, &sections, &.{ 0, 0 }, Context{ .refuse = false }, Context.prepare));
            applyMany(a, &sections, &.{ 0, 1 }, Context{ .refuse = true }, Context.prepare) catch |err| {
                for (sections) |section| try std.testing.expect(section.form_values == null);
                if (err != error.PreparationRefused) return err;
            };
            for (sections) |section| try std.testing.expect(section.form_values == null);
            applyMany(a, &sections, &.{ 0, 1 }, Context{ .refuse = false }, Context.prepare) catch |err| {
                for (sections) |section| try std.testing.expect(section.form_values == null);
                return err;
            };
            for (sections, 0..) |section, index| {
                try std.testing.expectEqual(@as(u32, @intCast(index + 1)), section.form_values.?[0].source_node);
                try std.testing.expectEqualSlices(u8, &.{ '1', 0 }, section.form_values.?[0].text);
            }
        }
    };
    try @import("../testing/allocation_failures.zig").check(Run.run, .{});
}
