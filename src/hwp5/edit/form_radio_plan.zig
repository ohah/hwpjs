//! Pure radio selection plan over caller-resolved group scopes/current values.
const std = @import("std");
pub const Identity = struct { section: u32, node: u32 };
pub const Member = struct {
    identity: Identity,
    // The caller resolves scope; this planner never guesses it from paragraphs.
    scope: u32,
    group: []const u8,
    state: u8,
    enabled: bool,
    editable: bool,
};
pub const Change = struct { identity: Identity, state: u8 };
fn same(a: Identity, b: Identity) bool {
    return a.section == b.section and a.node == b.node;
}
pub fn select(a: std.mem.Allocator, members: []const Member, target: Identity, limit: usize) ![]Change {
    if (members.len > limit) return error.LimitExceeded;
    var seen: std.AutoHashMapUnmanaged(Identity, void) = .empty;
    defer seen.deinit(a);
    var selected: ?Member = null;
    for (members) |member| {
        if (member.group.len % 2 != 0) return error.InvalidRadioGroupName;
        const entry = try seen.getOrPut(a, member.identity);
        if (entry.found_existing) return error.SourceBindingMismatch;
        if (same(member.identity, target)) selected = member;
    }
    const wanted = selected orelse return error.InvalidRadioTarget;
    if (wanted.group.len == 0) {
        var unnamed: usize = 0;
        for (members) |member| if (member.scope == wanted.scope and member.group.len == 0) {
            unnamed += 1;
        };
        if (unnamed != 1) return error.AmbiguousUnnamedRadioGroup;
    }
    if (!wanted.enabled or !wanted.editable) return error.FormRadioNotEditable;
    var changes: std.ArrayList(Change) = .empty;
    errdefer changes.deinit(a);
    for (members) |member| {
        if (member.scope != wanted.scope or !std.mem.eql(u8, member.group, wanted.group)) continue;
        if (member.state > 1) return error.UnsupportedRadioState;
        const next: u8 = @intFromBool(same(member.identity, target));
        if (next == member.state) continue;
        // A locked peer cannot be silently mutated to clear the group.
        if (!member.editable or !member.enabled) return error.FormRadioGroupNotEditable;
        try changes.append(a, .{ .identity = member.identity, .state = next });
    }
    return changes.toOwnedSlice(a);
}

test "HWP5 radio plan exact names scopes duplicate identities and allocation failures" {
    const a = std.testing.allocator;
    var members = [_]Member{
        .{ .identity = .{ .section = 0, .node = 1 }, .scope = 0, .group = &.{ 'G', 0 }, .state = 1, .enabled = true, .editable = true },
        .{ .identity = .{ .section = 1, .node = 1 }, .scope = 0, .group = &.{ 'G', 0 }, .state = 0, .enabled = true, .editable = true },
        .{ .identity = .{ .section = 1, .node = 2 }, .scope = 1, .group = &.{ 'G', 0 }, .state = 1, .enabled = true, .editable = true },
        .{ .identity = .{ .section = 0, .node = 2 }, .scope = 0, .group = &.{ 'g', 0 }, .state = 1, .enabled = true, .editable = true },
    };
    const wanted = [_]Change{ .{ .identity = members[0].identity, .state = 0 }, .{ .identity = members[1].identity, .state = 1 } };
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, rows: []const Member, expected: []const Change) !void {
            const result = try select(allocator, rows, rows[1].identity, 100);
            defer allocator.free(result);
            try std.testing.expectEqualDeep(expected, result);
        }
    }.run, .{ &members, &wanted });
    const noop = try select(a, &members, members[0].identity, 100);
    defer a.free(noop);
    try std.testing.expectEqual(@as(usize, 0), noop.len);
    try std.testing.expectError(error.InvalidRadioTarget, select(a, &members, .{ .section = 9, .node = 9 }, 100));
    members[1].enabled = false;
    try std.testing.expectError(error.FormRadioNotEditable, select(a, &members, members[1].identity, 100));
    members[1].enabled = true;
    members[1].state = 1;
    const repair = try select(a, &members, members[1].identity, 100);
    defer a.free(repair);
    try std.testing.expectEqualDeep(&[_]Change{.{ .identity = members[0].identity, .state = 0 }}, repair);
    members[1].state = 0;
    try std.testing.expectError(error.LimitExceeded, select(a, &members, members[1].identity, 3));
    members[0].editable = false;
    try std.testing.expectError(error.FormRadioGroupNotEditable, select(a, &members, members[1].identity, 100));
    members[0].editable = true;
    members[0].state = 2;
    try std.testing.expectError(error.UnsupportedRadioState, select(a, &members, members[1].identity, 100));
    members[0].state = 1;
    members[1].group = &.{};
    const singleton = try select(a, &members, members[1].identity, 100);
    defer a.free(singleton);
    try std.testing.expectEqualDeep(&[_]Change{.{ .identity = members[1].identity, .state = 1 }}, singleton);
    members[0].group = &.{};
    try std.testing.expectError(error.AmbiguousUnnamedRadioGroup, select(a, &members, members[1].identity, 100));
    members[0].group = &.{ 'G', 0 };
    members[1].group = &.{1};
    try std.testing.expectError(error.InvalidRadioGroupName, select(a, &members, members[1].identity, 100));
    members[1].group = members[0].group;
    members[1].identity = members[0].identity;
    try std.testing.expectError(error.SourceBindingMismatch, select(a, &members, members[0].identity, 100));
}

test "HWP5 radio plan actual request groups span paragraphs without changing other groups" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/basic/request.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    var tree = try @import("source_tree.zig").parse(a, bytes, source.header.version(), .{});
    defer tree.deinit(a);
    var forms = try @import("../body/form_links.zig").collectObservedUnits(a, tree, .{});
    defer forms.deinit(a);
    var members: std.ArrayList(Member) = .empty;
    defer members.deinit(a);
    const semantics = @import("../body/form_semantics.zig");
    for (forms.forms.forms) |form| {
        if (form.envelope.kind() != .radio_button) continue;
        const report = try @import("../body/form_schema.zig").inspectObserved(form.properties, .radio_button);
        const group = report.get(form.properties, .radio_group_name) orelse return error.MissingTestRadioGroup;
        const choice = semantics.inspectObserved(form.properties, report, .radio_button, .absent).choice;
        try members.append(a, .{ .identity = .{ .section = 0, .node = @intCast(form.object_node) }, .scope = 0, .group = group.value, .state = switch (choice) {
            .unchecked => 0,
            .checked => 1,
            else => return error.InvalidTestRadioState,
        }, .enabled = semantics.flagObserved(form.properties, report, .enabled) == .on, .editable = semantics.flagObserved(form.properties, report, .editable) == .on });
    }
    try std.testing.expectEqual(@as(usize, 13), members.items.len);
    for ([_][2]u32{ .{ 215, 217 }, .{ 273, 289 }, .{ 303, 301 } }, [_]usize{ 2, 7, 4 }) |pair, group_size| {
        const target: Identity = .{ .section = 0, .node = pair[1] };
        const plan = try select(a, members.items, target, 100);
        defer a.free(plan);
        try std.testing.expectEqual(@as(usize, 2), plan.len);
        var seen_target = false;
        var seen_old = false;
        for (plan) |change| {
            if (change.identity.node == pair[0] and change.state == 0) seen_old = true;
            if (change.identity.node == pair[1] and change.state == 1) seen_target = true;
        }
        try std.testing.expect(seen_target and seen_old);
        var group: ?[]const u8 = null;
        for (members.items) |member| if (same(member.identity, target)) {
            group = member.group;
        };
        var count: usize = 0;
        for (members.items) |member| if (std.mem.eql(u8, member.group, group.?)) {
            count += 1;
        };
        try std.testing.expectEqual(group_size, count);
    }
}
