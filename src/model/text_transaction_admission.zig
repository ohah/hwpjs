//! Read-only admission for one existing Native History transaction. No mutation,
//! persistent cache, replacement search or second command queue lives here.
const std = @import("std");
const m = @import("text_transaction.zig");
const refs = @import("text_transaction_binding.zig");
const lifetime = @import("formatting_binding.zig");
const Owner = @import("formatting_patch.zig").Owner;
pub const Group = struct { target: refs.Target, request: m.Group };

/// All returned slices borrow the request. The adapter must consume the plan
/// synchronously, before any intervening change, through ONE History.applyBatch.
/// Resolver.checkCoverage compares claims to a complete live Native inventory;
/// Resolver.validate checks current identity, expected text, scalar/control and
/// field permissions, plus supported insertion formatting. Neither may mutate.
pub fn prepare(a: std.mem.Allocator, state: lifetime.State, revision: u32, input: m.Apply, resolver: anytype) ![]Group {
    if (input.binding.revision == null) return error.InvalidTextTransactionBinding;
    if (revision == std.math.maxInt(u32)) return error.InvalidTextTransactionRevision;
    try state.check(input.binding, revision);
    if (input.groups.len > m.limits.groups) return error.LimitExceeded;
    if ((input.scope == .@"complete-current-paragraph-snapshot") != (input.coverage != null)) return error.InvalidTextTransactionCoverage;
    if (input.coverage) |coverage| try resolver.checkCoverage(coverage);
    var seen: std.AutoHashMapUnmanaged(Owner, void) = .empty;
    defer seen.deinit(a);
    try seen.ensureTotalCapacity(a, @intCast(input.groups.len));
    const result = try a.alloc(Group, input.groups.len);
    errdefer a.free(result);
    var edits: usize = 0;
    var inserted: usize = 0;
    var before: u64 = 0;
    var after: u64 = 0;
    // Resolve/shape-check the entire request before expensive source validation.
    // One paragraph can appear only once, including aliases of field/plain refs.
    for (input.groups, result) |group, *out| {
        const target = try refs.resolve(state, revision, group.ref);
        if (seen.getOrPutAssumeCapacity(target.owner).found_existing) return error.DuplicateTextTransactionTarget;
        if (group.edits.len > m.limits.edits_count - edits) return error.LimitExceeded;
        edits += group.edits.len;
        for (group.edits) |edit| if (edit.expected == null) return error.MissingExpectedText;
        const totals = try m.edits.validate(group.edits, group.before_units, .{
            .max_edits = m.limits.edits_count,
            .max_inserted_bytes = m.limits.inserted_bytes - inserted,
            .max_output_units = m.limits.text_units,
        });
        inserted += totals.inserted_bytes;
        before += group.before_units;
        after += totals.output_units;
        if (before > m.limits.text_units or after > m.limits.text_units) return error.LimitExceeded;
        if (group.insertion.hasParagraph() or group.insertion.reset != null) return error.UnsupportedTextInsertionFormatting;
        if (group.insertion.hasCharacter() and totals.inserted_units == 0) return error.EmptyStyledTextInsertion;
        out.* = .{ .target = target, .request = group };
    }
    for (result) |group| try resolver.validate(group.target, group.request);
    return result;
}

const TestResolver = struct {
    validations: usize = 0,
    coverage_checks: usize = 0,
    fail_paragraph: ?usize = null,
    pub fn checkCoverage(self: *@This(), coverage: m.Coverage) !void {
        self.coverage_checks += 1;
        if (coverage.sections.len != 1 or coverage.sections[0].section != 0 or coverage.sections[0].paragraphs != 3 or coverage.paragraphs != 3 or coverage.created_cell_paragraphs != 0) return error.IncompleteTextTransactionCoverage;
    }
    pub fn validate(self: *@This(), target: refs.Target, group: m.Group) !void {
        self.validations += 1;
        if (target.owner.section != 0 or target.owner.paragraph >= 3) return error.InvalidParagraph;
        if (self.fail_paragraph == target.owner.paragraph) return error.ProtectedTextRange;
        if (target.kind != .plain or group.before_units != 3) return error.InvalidTextTransactionTarget;
        if (!std.mem.eql(u8, group.edits[0].expected.?, "b")) return error.ExpectedTextMismatch;
    }
};
fn testInput(groups: []const m.Group) m.Apply {
    return .{ .binding = .{ .session = "s1", .revision = 7 }, .scope = .selection, .coverage = null, .groups = groups };
}
const testEdit = [_]m.edits.Edit{.{ .start = 1, .end = 2, .text = "X", .expected = "b" }};
const testGroups = [_]m.Group{
    .{ .ref = "t1-p1:0:0:r7:k0:b0", .before_units = 3, .edits = &testEdit },
    .{ .ref = "t1-p1:0:2:r7:k0:b0", .before_units = 3, .edits = &testEdit },
};

test "independent text admission resolves all targets before live validation and never mutates" {
    const a = std.testing.allocator;
    var state: lifetime.State = .{};
    try state.open();
    var resolver: TestResolver = .{};
    const plan = try prepare(a, state, 7, testInput(&testGroups), &resolver);
    defer a.free(plan);
    try std.testing.expectEqual(@as(usize, 2), resolver.validations);
    try std.testing.expectEqual(@as(usize, 2), plan[1].target.owner.paragraph);
    try std.testing.expectEqualStrings("X", plan[1].request.edits[0].text);
    resolver = .{ .fail_paragraph = 2 };
    try std.testing.expectError(error.ProtectedTextRange, prepare(a, state, 7, testInput(&testGroups), &resolver));
    try std.testing.expectEqual(@as(usize, 2), resolver.validations);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, s: lifetime.State) !void {
            var r: TestResolver = .{};
            const candidate = try prepare(allocator, s, 7, testInput(&testGroups), &r);
            defer allocator.free(candidate);
        }
    }.run, .{state});
}

test "independent text admission rejects stale refs aliases and incomplete coverage before authority" {
    const a = std.testing.allocator;
    var state: lifetime.State = .{};
    try state.open();
    var resolver: TestResolver = .{};
    var input = testInput(&testGroups);
    try std.testing.expectError(error.InvalidTextTransactionRevision, prepare(a, state, std.math.maxInt(u32), testInput(&.{}), &resolver));
    input.binding.revision = 8;
    try std.testing.expectError(error.StaleFormattingBinding, prepare(a, state, 7, input, &resolver));
    var groups = testGroups;
    groups[1].ref = "t1-p1:0:2:r6:k0:b0";
    try std.testing.expectError(error.StaleTextTransactionReference, prepare(a, state, 7, testInput(&groups), &resolver));
    groups[1].ref = "t1-p1:0:0:r7:k2:b19";
    try std.testing.expectError(error.DuplicateTextTransactionTarget, prepare(a, state, 7, testInput(&groups), &resolver));
    try std.testing.expectEqual(@as(usize, 0), resolver.validations);
    input = testInput(&testGroups);
    input.scope = .@"complete-current-paragraph-snapshot";
    input.coverage = .{ .sections = &.{.{ .section = 0, .paragraphs = 2 }}, .paragraphs = 2, .created_cell_paragraphs = 0 };
    try std.testing.expectError(error.IncompleteTextTransactionCoverage, prepare(a, state, 7, input, &resolver));
    input.coverage.?.sections = &.{.{ .section = 0, .paragraphs = 3 }};
    input.coverage.?.paragraphs = 3;
    const plan = try prepare(a, state, 7, input, &resolver);
    defer a.free(plan);
    try std.testing.expectEqual(@as(usize, 2), resolver.coverage_checks);
    try std.testing.expectEqual(@as(usize, 2), resolver.validations);
}

test "independent text admission direct callers cannot omit expected text or add paragraph formatting" {
    const a = std.testing.allocator;
    var state: lifetime.State = .{};
    try state.open();
    var resolver: TestResolver = .{};
    var group = testGroups[0];
    group.edits = &.{.{ .start = 1, .end = 2, .text = "X" }};
    try std.testing.expectError(error.MissingExpectedText, prepare(a, state, 7, testInput(&.{group}), &resolver));
    group = testGroups[0];
    group.insertion.paragraph.alignment = .CENTER;
    try std.testing.expectError(error.UnsupportedTextInsertionFormatting, prepare(a, state, 7, testInput(&.{group}), &resolver));
    group = testGroups[0];
    group.edits = &.{.{ .start = 1, .end = 2, .text = "", .expected = "b" }};
    group.insertion.character.bold = true;
    try std.testing.expectError(error.EmptyStyledTextInsertion, prepare(a, state, 7, testInput(&.{group}), &resolver));
    try std.testing.expectEqual(@as(usize, 0), resolver.validations);
}
