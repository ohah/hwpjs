//! One ordinary-policy paragraph splice preparation, on original UTF-16 units.
//! No repeated single commands, section policy overrides, saved-byte model or
//! retained request slices. Source validation still owns editing permission.
const std = @import("std");
const model = @import("../../model/document.zig");
const independent = @import("../../model/independent_text_edits.zig");
const content = @import("plain_text_content.zig");
const runs = @import("character_runs.zig");
const testing = @import("builtin").is_test;
pub const Work = if (testing) struct {
    source_validations: usize = 0,
    before_bytes: usize = 0,
    control_tokens: usize = 0,
    edit_checks: usize = 0,
    boundary_steps: usize = 0,
    range_rows: usize = 0,
    run_rows: usize = 0,
    field_prefix_steps: usize = 0,
    output_bytes: usize = 0,
} else void;
pub const Options = if (testing) struct {
    range_policy: @FieldType(@import("plain_text.zig").Splice, "range_policy") = .reject,
    limits: independent.Limits = .{},
    work: ?*Work = null,
} else struct {
    range_policy: @FieldType(@import("plain_text.zig").Splice, "range_policy") = .reject,
    limits: independent.Limits = .{},
};
const Encoded = struct { bytes: []u8, active: bool };

pub fn apply(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, p: *model.Paragraph, edits: []const independent.Edit, char_count: usize, options: Options) !bool {
    return applyScoped(a, null, source, version, p, edits, char_count, options);
}
pub fn applyScoped(a: std.mem.Allocator, context: ?*@import("plain_text_source.zig").OrdinaryContext, source: []const u8, version: @import("../version.zig").Version, p: *model.Paragraph, edits: []const independent.Edit, char_count: usize, options: Options) !bool {
    var local: Work = if (testing) .{} else {};
    const work = if (testing) options.work orelse &local else {};
    if (testing) work.source_validations += 1;
    const validated = if (context) |scope| try scope.validate(a, source, version, p.*, char_count) else try @import("plain_text_source.zig").validate(a, source, version, p.*, char_count);
    const before = try content.editableTextBytes(a, p.*);
    defer a.free(before);
    if (testing) work.before_bytes += before.len;
    try @import("control_boundaries.zig").validateRetainedText(before);
    if (before.len < 2) return error.UnsupportedParagraphTerminator;
    const before_units = std.math.cast(u32, before.len / 2) orelse return error.LimitExceeded;
    const totals = try independent.validate(edits, before_units - 1, options.limits);
    const output_units = std.math.add(u32, totals.output_units, 1) catch return error.LimitExceeded;
    const output_len = std.math.mul(usize, output_units, 2) catch return error.LimitExceeded;
    if (output_len > 8 * 1024 * 1024) return error.LimitExceeded;
    if (testing) {
        work.control_tokens += try @import("control_boundaries.zig").validateIndependent(before, edits);
    } else try @import("control_boundaries.zig").validateIndependent(before, edits);
    const encoded = try a.alloc(Encoded, edits.len);
    var initialized: usize = 0;
    defer {
        for (encoded[0..initialized]) |value| a.free(value.bytes);
        a.free(encoded);
    }
    var active: std.ArrayList(runs.Independent) = .empty;
    defer active.deinit(a);
    for (edits, 0..) |edit, index| {
        if (testing) work.edit_checks += 1;
        const bytes = try @import("plain_text.zig").inserted(a, edit.text);
        encoded[index] = .{ .bytes = bytes, .active = !std.mem.eql(u8, before[@as(usize, edit.start) * 2 .. @as(usize, edit.end) * 2], bytes) };
        initialized += 1;
        if (edit.expected) |expected| {
            const utf16 = try std.unicode.utf8ToUtf16LeAlloc(a, expected);
            defer a.free(utf16);
            if (!std.mem.eql(u8, std.mem.sliceAsBytes(utf16), before[@as(usize, edit.start) * 2 .. @as(usize, edit.end) * 2])) return error.ExpectedTextMismatch;
        }
        if (encoded[index].active) try active.append(a, .{ .start = edit.start, .end = edit.end, .added = @intCast(bytes.len / 2) });
    }

    // Dense maps bound work even for unsorted range/field metadata. Their memory
    // is linear in the already size-bounded input, never in K * paragraph size.
    const mapping = try a.alloc(u32, @as(usize, before_units) + 1);
    defer a.free(mapping);
    var cursor: usize = 0;
    var delta: i64 = 0;
    for (active.items) |edit| {
        while (cursor < edit.start) : (cursor += 1) {
            if (testing) work.boundary_steps += 1;
            mapping[cursor] = @intCast(@as(i64, @intCast(cursor)) + delta);
        }
        while (cursor < edit.end) : (cursor += 1) {
            if (testing) work.boundary_steps += 1;
            mapping[cursor] = @intCast(@as(i64, edit.start) + delta);
        }
        delta += @as(i64, edit.added) - @as(i64, edit.end - edit.start);
    }
    while (cursor < mapping.len) : (cursor += 1) {
        if (testing) work.boundary_steps += 1;
        mapping[cursor] = @intCast(@as(i64, @intCast(cursor)) + delta);
    }
    const touches = try a.alloc(u32, @as(usize, before_units) + 2);
    defer a.free(touches);
    @memset(touches, 0);
    // Reuse the same buffer for signed differences and then the prefix. Ordered
    // disjoint edits bound coincident closed endpoints; no K*input allocation.
    for (edits) |edit| {
        touches[edit.start] +%= 1;
        touches[edit.end + 1] -%= 1;
    }
    var coverage: i64 = 0;
    var prefix: u32 = 0;
    for (0..touches.len) |index| {
        if (testing) work.boundary_steps += 1;
        const difference: i32 = @bitCast(touches[index]);
        touches[index] = prefix;
        coverage += difference;
        prefix += @intFromBool(coverage != 0);
    }
    const owned_ranges = try @import("text_ranges.zig").prepareIndependent(a, p.range_tags, validated.ranges, before, mapping, touches, options.range_policy == .reject, if (testing) &work.range_rows else {});
    errdefer a.free(owned_ranges);
    if (active.items.len == 0) {
        a.free(owned_ranges);
        return false;
    }
    try runs.validate(p.character_runs, before, char_count);
    const owned_runs = try runs.replaceIndependent(a, p.character_runs, active.items, if (testing) &work.run_rows else {});
    errdefer a.free(owned_runs);
    const starts = try a.alloc(u32, @as(usize, before_units) + 2);
    defer a.free(starts);
    @memset(starts, 0);
    for (active.items) |edit| starts[edit.start + 1] += 1;
    for (1..starts.len) |index| {
        if (testing) work.field_prefix_steps += 1;
        starts[index] += starts[index - 1];
    }
    const owned_fields = if (context) |scope| try scope.prepareFields(a, p.*, before, starts) else try @import("field_attributes.zig").prepareIndependent(a, source, version, p.*, before, starts);
    errdefer if (owned_fields) |fields| a.free(fields);
    const after = try a.alloc(u8, output_len);
    defer a.free(after);
    var previous: usize = 0;
    var output: usize = 0;
    for (edits, encoded) |edit, value| {
        if (!value.active) continue;
        const start = @as(usize, edit.start) * 2;
        const end = @as(usize, edit.end) * 2;
        @memcpy(after[output..][0 .. start - previous], before[previous..start]);
        output += start - previous;
        @memcpy(after[output..][0..value.bytes.len], value.bytes);
        output += value.bytes.len;
        previous = end;
    }
    @memcpy(after[output..], before[previous..]);
    if (testing) work.output_bytes += after.len;
    const owned_tokens = try @import("token_ownership.zig").fromText(a, after);
    // Publication has no fallible work. All original buffers survive every
    // earlier validation/expected/metadata/OOM failure with pointer identity.
    for (p.tokens) |token| a.free(token.raw);
    a.free(p.tokens);
    a.free(p.character_runs);
    if (p.range_tags) |ranges| a.free(ranges);
    if (p.field_attributes) |fields| a.free(fields);
    p.tokens = owned_tokens;
    p.character_runs = owned_runs;
    p.range_tags = owned_ranges;
    p.field_attributes = owned_fields;
    p.text_present = true;
    p.declared_units = @intCast(after.len / 2);
    p.deferred_direct_records = validated.preserved_direct_records;
    return true;
}
