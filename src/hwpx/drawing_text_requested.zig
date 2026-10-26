//! 요청한 노드만 판정하는 선택적 배치입니다. 현재 view를 요청 사이에 보관하지 않습니다.
const std = @import("std");
const editor = @import("editor_session.zig");
const snapshots = @import("drawing_text_snapshot.zig");
const hosts = @import("rectangle_display_host.zig");
const current = @import("display_current_paragraphs.zig");
pub const max_nodes: usize = 1024;
pub const Result = union(enum) { source: snapshots.Snapshot, unavailable: anyerror };
pub const Entry = struct { node: usize, result: Result };
pub const Report = struct {
    entries: []Entry,
    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        a.free(self.entries);
        self.* = undefined;
    }
};

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize, nodes: []const usize) !Report {
    return readUsing(a, session, section_index, nodes, current.read);
}

fn readUsing(a: std.mem.Allocator, session: *const editor.Session, section_index: usize, nodes: []const usize, comptime view_reader: anytype) !Report {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    if (nodes.len > max_nodes) return error.LimitExceeded;
    const entries = try a.alloc(Entry, nodes.len);
    errdefer a.free(entries);
    const section = &session.sections[section_index];
    var view: ?current.View = null;
    defer if (view) |*value| value.deinit(a);
    var attempted = false;
    var view_error: ?anyerror = null;
    for (nodes, entries) |node, *entry| {
        // single의 anchor 선검사와 오류 우선순위를 그대로 사용합니다.
        hosts.validateNode(&section.tree, node) catch |err| {
            if (err == error.OutOfMemory) return err;
            entry.* = .{ .node = node, .result = .{ .unavailable = err } };
            continue;
        };
        if (!attempted) {
            attempted = true;
            if (view_reader(a, section, session.options)) |built| {
                view = built;
            } else |err| {
                if (err == error.OutOfMemory) return err;
                view_error = err;
            }
        }
        if (view_error) |err| {
            entry.* = .{ .node = node, .result = .{ .unavailable = err } };
            continue;
        }
        const host = hosts.readCurrent(a, section, view.?.paragraphs, node) catch |err| {
            if (err == error.OutOfMemory) return err;
            entry.* = .{ .node = node, .result = .{ .unavailable = err } };
            continue;
        };
        const source = snapshots.readWithHost(a, &section.tree, node, host) catch |err| {
            if (err == error.OutOfMemory) return err;
            entry.* = .{ .node = node, .result = .{ .unavailable = err } };
            continue;
        };
        entry.* = .{ .node = node, .result = .{ .source = source } };
    }
    return .{ .entries = entries };
}

fn input(a: std.mem.Allocator) ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapecontainer-2.hwpx", a, .limited(4_000_000));
}
fn compareSingles(a: std.mem.Allocator, session: *const editor.Session, nodes: []const usize) !void {
    var report = try read(a, session, 0, nodes);
    defer report.deinit(a);
    try std.testing.expectEqual(nodes.len, report.entries.len);
    for (nodes, report.entries) |node, entry| {
        try std.testing.expectEqual(node, entry.node);
        if (snapshots.read(a, session, 0, node)) |single| {
            try std.testing.expectEqualDeep(single, entry.result.source);
        } else |err| {
            if (err == error.OutOfMemory) return err;
            try std.testing.expectEqual(err, entry.result.unavailable);
        }
    }
}
test "requested drawing 순서 중복 노드별 오류와 기존 single 동등" {
    const a = std.testing.allocator;
    const bytes = try input(a);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    try compareSingles(a, &session, &.{ 122, 0, 94, 122 });
    try std.testing.expectError(error.InvalidSectionIndex, read(a, &session, 999, &.{}));
    var empty = try read(a, &session, 0, &.{});
    defer empty.deinit(a);
    try std.testing.expectEqual(@as(usize, 0), empty.entries.len);
    const many: [1025]usize = @splat(0);
    try std.testing.expectError(error.LimitExceeded, read(a, &session, 0, &many));
    var full = try read(a, &session, 0, many[0..1024]);
    defer full.deinit(a);
    try std.testing.expectEqual(@as(usize, 1024), full.entries.len);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}
test "requested drawing view 한 번과 anchor 선검사 및 공통 오류 우선순위" {
    const a = std.testing.allocator;
    const bytes = try input(a);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const Provider = struct {
        var calls: usize = 0;
        fn counted(allocator: std.mem.Allocator, section: *const editor.Section, options: editor.Options) !current.View {
            calls += 1;
            return current.read(allocator, section, options);
        }
        fn refused(_: std.mem.Allocator, _: *const editor.Section, _: editor.Options) !current.View {
            calls += 1;
            return error.UnsupportedStructuralFieldEdit;
        }
        fn oom(_: std.mem.Allocator, _: *const editor.Section, _: editor.Options) !current.View {
            return error.OutOfMemory;
        }
    };
    Provider.calls = 0;
    var report = try readUsing(a, &session, 0, &.{ 0, 94, 122, 94 }, Provider.counted);
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), Provider.calls);
    Provider.calls = 0;
    var refused = try readUsing(a, &session, 0, &.{ 0, 94, 0, 122 }, Provider.refused);
    defer refused.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), Provider.calls);
    for (refused.entries) |row| try std.testing.expectEqual(if (row.node == 0) error.UnsupportedDrawingTextAnchor else error.UnsupportedStructuralFieldEdit, row.result.unavailable);
    try std.testing.expectError(error.OutOfMemory, readUsing(a, &session, 0, &.{ 0, 94 }, Provider.oom));
    Provider.calls = 0;
    var invalid = try readUsing(a, &session, 0, &.{ 0, 0 }, Provider.counted);
    defer invalid.deinit(a);
    try std.testing.expectEqual(@as(usize, 0), Provider.calls);
}
test "requested drawing 할당 실패 전체 정리와 현재 anchor 이력 동등" {
    const a = std.testing.allocator;
    const bytes = try input(a);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const Check = struct {
        fn run(allocator: std.mem.Allocator, state: *const editor.Session) !void {
            var report = try read(allocator, state, 0, &.{ 0, 94, 122, 94 });
            defer report.deinit(allocator);
            try std.testing.expectEqual(error.UnsupportedDrawingTextAnchor, report.entries[0].result.unavailable);
            try std.testing.expectEqualDeep(try snapshots.read(allocator, state, 0, 94), report.entries[1].result.source);
        }
    };
    try @import("../testing/allocation_failures.zig").check(Check.run, .{&session});
    const History = @import("editor_history.zig").History;
    var history = try History.init(&session, 8, 16 * 1024 * 1024);
    defer history.deinit();
    const before = try snapshots.read(a, &session, 0, 94);
    try std.testing.expect(try history.apply(&session, .{ .kind = .anchored, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "앞😀" }));
    try compareSingles(a, &session, &.{ 122, 94 });
    try std.testing.expectEqual(before.anchor_unit + 3, (try snapshots.read(a, &session, 0, 94)).anchor_unit);
    try std.testing.expect(try history.undo(&session));
    try std.testing.expectEqualDeep(before, try snapshots.read(a, &session, 0, 94));
    try std.testing.expect(try history.redo(&session));
    try compareSingles(a, &session, &.{ 94, 122, 94 });
}
test "requested drawing 알 수 없는 shadow는 지원으로 승격하지 않음" {
    const a = std.testing.allocator;
    const bytes = try input(a);
    defer a.free(bytes);
    var original = try editor.open(a, bytes, .{});
    defer original.deinit();
    const single = try snapshots.read(a, &original, 0, 94);
    const tree = &original.sections[0].tree;
    const tag = tree.elements[single.paint.shadow_node.?].start_tag;
    const changed = try std.mem.replaceOwned(u8, a, tree.source[tag.start..tag.end], "type=\"NONE\"", "type=\"FUTURE_SHADOW\"");
    defer a.free(changed);
    const xml = try std.mem.concat(a, u8, &.{ tree.source[0..tag.start], changed, tree.source[tag.end..] });
    defer a.free(xml);
    const altered = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(altered);
    var session = try editor.open(a, altered, .{});
    defer session.deinit();
    try std.testing.expectError(error.UnsupportedDrawingShadowType, snapshots.read(a, &session, 0, 94));
    var report = try read(a, &session, 0, &.{ 94, 0, 122 });
    defer report.deinit(a);
    try std.testing.expectEqual(error.UnsupportedDrawingShadowType, report.entries[0].result.unavailable);
    try std.testing.expectEqual(error.UnsupportedDrawingTextAnchor, report.entries[1].result.unavailable);
    try std.testing.expectEqualDeep(try snapshots.read(a, &session, 0, 122), report.entries[2].result.source);
}
