//! Single owner of current dutmal leaf overrides; no mutable XML cache.
const std = @import("std");
const source = @import("dutmal_text_changes.zig");
const Tree = @import("xml_part_tree.zig").Tree;
pub const Entry = struct { control: usize, kind: source.Kind, text: []u8 };
pub const max_entries = 100000;
pub const Values = struct {
    entries: std.ArrayList(Entry) = .empty,
    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        for (self.entries.items) |entry| a.free(entry.text);
        self.entries.deinit(a);
        self.* = .{};
    }
    fn find(self: *const Values, control: usize, kind: source.Kind) !?usize {
        var found: ?usize = null;
        for (self.entries.items, 0..) |entry, index| {
            if (entry.control != control or entry.kind != kind) continue;
            if (found != null) return error.DuplicateDutmalTextEdit;
            found = index;
        }
        return found;
    }
    pub fn read(self: *const Values, a: std.mem.Allocator, tree: *const Tree, control: usize, kind: source.Kind, limit: usize) ![]u8 {
        _ = try source.target(tree, control, kind);
        if (try self.find(control, kind)) |index| {
            if (self.entries.items[index].text.len > limit) return error.LimitExceeded;
            return a.dupe(u8, self.entries.items[index].text);
        }
        return source.readValue(a, tree, control, kind, limit);
    }
    pub fn clone(self: *const Values, a: std.mem.Allocator) !Values {
        if (self.entries.items.len > max_entries) return error.LimitExceeded;
        var result: Values = .{};
        errdefer result.deinit(a);
        try result.entries.ensureTotalCapacity(a, self.entries.items.len);
        var seen: std.AutoHashMapUnmanaged(struct { control: usize, kind: source.Kind }, void) = .empty;
        defer seen.deinit(a);
        for (self.entries.items) |entry| {
            if ((try seen.getOrPut(a, .{ .control = entry.control, .kind = entry.kind })).found_existing) return error.DuplicateDutmalTextEdit;
            const text = try a.dupe(u8, entry.text);
            result.entries.appendAssumeCapacity(.{ .control = entry.control, .kind = entry.kind, .text = text });
        }
        return result;
    }
    pub fn byteSize(self: *const Values, limit: usize) !usize {
        var total = std.math.mul(usize, self.entries.capacity, @sizeOf(Entry)) catch return error.LimitExceeded;
        if (total > limit) return error.LimitExceeded;
        for (self.entries.items) |entry| {
            if (entry.text.len > limit - total) return error.LimitExceeded;
            total += entry.text.len;
        }
        return total;
    }
    pub fn set(self: *Values, a: std.mem.Allocator, tree: *const Tree, control: usize, kind: source.Kind, text: []const u8, limit: usize) !bool {
        const changes = try source.prepare(a, tree, control, kind, text, limit);
        defer a.free(changes);
        const original = try source.readValue(a, tree, control, kind, limit);
        defer a.free(original);
        const index = try self.find(control, kind);
        const previous = if (index) |at| self.entries.items[at].text else original;
        if (std.mem.eql(u8, previous, text)) return false;
        var candidate = try self.clone(a);
        defer candidate.deinit(a);
        if (index) |at| {
            if (std.mem.eql(u8, original, text)) {
                a.free(candidate.entries.orderedRemove(at).text);
            } else {
                const owned = try a.dupe(u8, text);
                a.free(candidate.entries.items[at].text);
                candidate.entries.items[at].text = owned;
            }
        } else {
            if (candidate.entries.items.len >= max_entries) return error.LimitExceeded;
            const owned = try a.dupe(u8, text);
            errdefer a.free(owned);
            try candidate.entries.append(a, .{ .control = control, .kind = kind, .text = owned });
        }
        _ = try candidate.byteSize(limit);
        std.mem.swap(Values, self, &candidate);
        return true;
    }
};

test "dutmal current values separate main sub ownership and restore source atomically" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:dutmal><p:mainText>A<![CDATA[😀]]></p:mainText><p:subText>원주</p:subText></p:dutmal></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var values: Values = .{};
    defer values.deinit(a);
    try std.testing.expect(try values.set(a, &tree, 3, .main_text, "새😀<&", 4096));
    var snapshot = try values.clone(a);
    defer snapshot.deinit(a);
    try std.testing.expect(try values.set(a, &tree, 3, .sub_text, "새주석", 4096));
    try std.testing.expectEqual(@as(usize, 2), values.entries.items.len);
    try std.testing.expectEqual(@as(usize, 1), snapshot.entries.items.len);
    try std.testing.expect(!try values.set(a, &tree, 3, .main_text, "새😀<&", 4096));
    const size = try values.byteSize(4096);
    try std.testing.expectError(error.LimitExceeded, values.byteSize(size - 1));
    try std.testing.expectError(error.InvalidXmlCharacter, values.set(a, &tree, 3, .main_text, &.{0}, 4096));
    try std.testing.expectError(error.LimitExceeded, values.set(a, &tree, 3, .main_text, "다른", 1));
    try std.testing.expect(try values.set(a, &tree, 3, .main_text, "A😀", 4096));
    try std.testing.expectEqual(@as(usize, 1), values.entries.items.len);
    const main = try values.read(a, &tree, 3, .main_text, 4096);
    defer a.free(main);
    const sub = try values.read(a, &tree, 3, .sub_text, 4096);
    defer a.free(sub);
    try std.testing.expectEqualStrings("A😀", main);
    try std.testing.expectEqualStrings("새주석", sub);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, base: *const Values) !void {
            var copy = try base.clone(allocator);
            defer copy.deinit(allocator);
            _ = copy.set(allocator, parsed, 3, .main_text, "다음😀", 4096) catch |err| {
                try std.testing.expectEqual(base.entries.items.len, copy.entries.items.len);
                for (base.entries.items, copy.entries.items) |before, after| {
                    try std.testing.expectEqualStrings(before.text, after.text);
                    try std.testing.expectEqual(before.kind, after.kind);
                }
                return err;
            };
        }
    };
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &tree, &values });
}

test "dutmal checkpoint restores owned strings through actual ZIP save" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpx/opengov/36389301_결재문서본문_직장훈련계획_덧말.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    var before = try @import("editor_checkpoint.zig").capture(&session, 4_000_000);
    defer before.deinit();
    const section = &session.sections[0];
    var control: ?usize = null;
    for (section.tree.elements, 0..) |_, index| if (@import("run_anchor.zig").kind(&section.tree, index) == .dutmal) {
        control = index;
        break;
    };
    const node = control orelse return error.InvalidDutmalNode;
    try std.testing.expect(try session.setDutmalText(0, node, .main_text, "편집😀"));
    try std.testing.expect(!try session.setDutmalText(0, node, .main_text, "편집😀"));
    try std.testing.expectError(error.InvalidXmlCharacter, session.setDutmalText(0, node, .main_text, &.{0}));
    const edited = try session.save();
    defer a.free(edited);
    var reopened = try @import("editor_session.zig").open(a, edited, .{});
    defer reopened.deinit();
    const saved_text = try source.readValue(a, &reopened.sections[0].tree, node, .main_text, 4_000_000);
    defer a.free(saved_text);
    try std.testing.expectEqualStrings("편집😀", saved_text);
    var current = try @import("editor_checkpoint.zig").capture(&session, 4_000_000);
    defer current.deinit();
    try before.exchange(&session);
    try std.testing.expectEqual(@as(usize, 0), section.dutmal_texts.entries.items.len);
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, input, restored);
    try before.exchange(&session);
    const text = try session.dutmalText(0, node, .main_text);
    defer a.free(text);
    try std.testing.expectEqualStrings("편집😀", text);
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, edited, redone);
    const size = try @import("editor_checkpoint.zig").size(&session, 4_000_000);
    try std.testing.expectError(error.LimitExceeded, @import("editor_checkpoint.zig").capture(&session, size - 1));
    try std.testing.expectEqualSlices(u8, input, session.source);
}

test "dutmal history keeps redo across failed and no-op commands" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpx/opengov/36389301_결재문서본문_직장훈련계획_덧말.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    var history = try @import("editor_history.zig").History.init(&session, 8, 4_000_000);
    defer history.deinit();
    var node: ?usize = null;
    for (session.sections[0].tree.elements, 0..) |_, index| if (@import("run_anchor.zig").kind(&session.sections[0].tree, index) == .dutmal) {
        node = index;
    };
    var command: @import("editor_history.zig").Command = .{ .kind = .dutmal_text, .dutmal_node = node.?, .dutmal_kind = .main_text, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "이력😀" };
    try std.testing.expect(try history.apply(&session, command));
    const edited = try session.save();
    defer a.free(edited);
    try std.testing.expect(try history.undo(&session));
    command.inserted = "팀단위 훈련";
    try std.testing.expect(!try history.apply(&session, command));
    command.inserted = &.{0};
    try std.testing.expectError(error.InvalidXmlCharacter, history.apply(&session, command));
    command.start = 1;
    command.inserted = "bad";
    try std.testing.expectError(error.InvalidDutmalTextCommand, history.apply(&session, command));
    const original = try session.save();
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, input, original);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, edited, redone);
}
