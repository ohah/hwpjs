//! Bounded strict wire decoding. Live source, coverage and binding checks belong
//! to the format adapter before the existing single History transaction.
const std = @import("std");
const m = @import("../model/text_transaction.zig");
const fields = @import("formatting_patch_request.zig");
const V = std.json.Value;
pub const Request = struct {
    arena: std.heap.ArenaAllocator,
    value: m.Apply,
    pub fn deinit(self: *Request) void {
        self.arena.deinit();
        self.* = undefined;
    }
};

/// Bound structure before allocating the dynamic JSON tree. Strings/escapes
/// remain the standard parser's responsibility; braces inside them do not count.
pub fn checkBudget(bytes: []const u8) !void {
    if (bytes.len > m.limits.request_bytes) return error.LimitExceeded;
    var stack: [m.limits.request_depth]u8 = undefined;
    var depth: usize = 0;
    var structure: usize = 0;
    var string = false;
    var escaped = false;
    for (bytes) |byte| {
        if (string) {
            if (escaped) escaped = false else if (byte == '\\') escaped = true else if (byte == '"') string = false;
            continue;
        }
        switch (byte) {
            '"' => string = true,
            '{', '[' => {
                if (depth == stack.len) return error.LimitExceeded;
                stack[depth] = byte;
                depth += 1;
                structure += 1;
            },
            '}', ']' => {
                if (depth == 0 or stack[depth - 1] != (if (byte == '}') @as(u8, '{') else '[')) return error.InvalidTextTransactionJson;
                depth -= 1;
                structure += 1;
            },
            ':', ',' => structure += 1,
            else => {},
        }
        if (structure > m.limits.request_structure) return error.LimitExceeded;
    }
    if (string or escaped or depth != 0) return error.InvalidTextTransactionJson;
}

pub fn decode(a: std.mem.Allocator, bytes: []const u8) !Request {
    try checkBudget(bytes);
    var arena = std.heap.ArenaAllocator.init(a);
    errdefer arena.deinit();
    const aa = arena.allocator();
    const root = try std.json.parseFromSliceLeaky(V, aa, bytes, .{ .allocate = .alloc_always, .max_value_len = m.limits.request_bytes, .duplicate_field_behavior = .@"error" });
    try fields.keys(root, &.{ "schemaVersion", "binding", "scope", "coverage", "groups" });
    if (try fields.uint(try fields.required(root, "schemaVersion"), 0xffffffff) != 1) return error.InvalidTextTransactionSchema;
    const binding = try fields.decodeBinding(try fields.required(root, "binding"), false);
    const scope = try fields.enumeration(m.Scope, try fields.required(root, "scope"));
    const coverage = if (fields.get(root, "coverage")) |value| try decodeCoverage(aa, value) else null;
    if ((scope == .@"complete-current-paragraph-snapshot") != (coverage != null)) return error.InvalidTextTransactionCoverage;
    const items = try fields.array(try fields.required(root, "groups"));
    if (items.len > m.limits.groups) return error.LimitExceeded;
    const groups = try aa.alloc(m.Group, items.len);
    var references: std.StringHashMapUnmanaged(void) = .empty;
    var edit_count: usize = 0;
    var inserted_bytes: usize = 0;
    var input_units: u64 = 0;
    var output_units: u64 = 0;
    for (items, groups) |item, *group| {
        try fields.keys(item, &.{ "ref", "beforeUnits", "edits", "insertion" });
        const ref = try fields.opaqueToken(try fields.required(item, "ref"));
        const seen = try references.getOrPut(aa, ref);
        if (seen.found_existing) return error.DuplicateTextTransactionTarget;
        const before: u32 = @intCast(try fields.uint(try fields.required(item, "beforeUnits"), m.limits.text_units));
        const raw_edits = try fields.array(try fields.required(item, "edits"));
        if (raw_edits.len > m.limits.edits_count - edit_count) return error.LimitExceeded;
        edit_count += raw_edits.len;
        const edits = try aa.alloc(m.edits.Edit, raw_edits.len);
        for (raw_edits, edits) |raw, *edit| {
            try fields.keys(raw, &.{ "startUnit", "endUnit", "text", "expectedOriginal" });
            edit.* = .{
                .start = @intCast(try fields.uint(try fields.required(raw, "startUnit"), before)),
                .end = @intCast(try fields.uint(try fields.required(raw, "endUnit"), before)),
                .text = try fields.string(try fields.required(raw, "text")),
                .expected = try fields.string(try fields.required(raw, "expectedOriginal")),
            };
        }
        const totals = try m.edits.validate(edits, before, .{ .max_edits = m.limits.edits_count, .max_inserted_bytes = m.limits.inserted_bytes - inserted_bytes, .max_output_units = m.limits.text_units });
        inserted_bytes += totals.inserted_bytes;
        input_units += before;
        output_units += totals.output_units;
        if (input_units > m.limits.text_units or output_units > m.limits.text_units) return error.LimitExceeded;
        const insertion: @import("../model/formatting_patch.zig").Patch = if (fields.get(item, "insertion")) |intent| try fields.decodeCharacterInsertion(intent) else .{};
        if (insertion.hasCharacter() and totals.inserted_units == 0) return error.EmptyStyledTextInsertion;
        group.* = .{ .ref = ref, .before_units = before, .edits = edits, .insertion = insertion };
    }
    return .{ .arena = arena, .value = .{ .binding = binding, .scope = scope, .coverage = coverage, .groups = groups } };
}

fn decodeCoverage(a: std.mem.Allocator, value: V) !m.Coverage {
    try fields.keys(value, &.{ "sections", "totalParagraphs", "createdCellParagraphs" });
    const paragraphs: u32 = @intCast(try fields.uint(try fields.required(value, "totalParagraphs"), m.limits.snapshot_paragraphs));
    const created: u32 = @intCast(try fields.uint(try fields.required(value, "createdCellParagraphs"), m.limits.snapshot_paragraphs));
    const items = try fields.array(try fields.required(value, "sections"));
    if (items.len > m.limits.sections) return error.LimitExceeded;
    const sections = try a.alloc(m.SectionCoverage, items.len);
    var count: u64 = 0;
    for (items, sections, 0..) |item, *section, index| {
        try fields.keys(item, &.{ "section", "paragraphCount" });
        const id = try fields.uint(try fields.required(item, "section"), m.limits.sections - 1);
        if (id != index) return error.InvalidTextTransactionCoverage;
        const amount: u32 = @intCast(try fields.uint(try fields.required(item, "paragraphCount"), m.limits.snapshot_paragraphs));
        count += amount;
        if (count > m.limits.snapshot_paragraphs) return error.LimitExceeded;
        section.* = .{ .section = @intCast(id), .paragraphs = amount };
    }
    if (count != paragraphs or created > paragraphs) return error.InvalidTextTransactionCoverage;
    return .{ .sections = sections, .paragraphs = paragraphs, .created_cell_paragraphs = created };
}

const sample =
    \\{"schemaVersion":1,"binding":{"session":"s1","revision":0},"scope":"selection","groups":[{"ref":"t1-p1:0:2:r0:k0:b0","beforeUnits":4,"edits":[{"startUnit":0,"endUnit":2,"text":"","expectedOriginal":"😀"},{"startUnit":3,"endUnit":3,"text":"한","expectedOriginal":""}],"insertion":{"character":{"bold":true,"textColor":1193046,"underline":{"kind":"bottom","style":"SOLID"},"fonts":{"hangul":{"name":"Hangul"},"latin":{"name":"Latin"}}}}}]}
;
test "independent text transaction request owns Unicode, deletion and sparse inserted formatting" {
    var request = try decode(std.testing.allocator, sample);
    defer request.deinit();
    const value = request.value;
    try std.testing.expectEqual(@as(usize, 1), value.groups.len);
    try std.testing.expectEqualStrings("", value.groups[0].edits[0].text);
    try std.testing.expectEqualStrings("😀", value.groups[0].edits[0].expected.?);
    try std.testing.expectEqual(@as(?bool, true), value.groups[0].insertion.character.bold);
    try std.testing.expectEqual(@as(?u32, 1193046), value.groups[0].insertion.character.text_color);
    try std.testing.expectEqualStrings("Latin", value.groups[0].insertion.fonts[1].?.name);
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var candidate = try decode(a, sample);
            defer candidate.deinit();
        }
    }.run, .{});
}

test "independent text transaction request rejects claims and unknown fields before authority" {
    const cases = [_][]const u8{
        "{\"schemaVersion\":2,\"binding\":{\"session\":\"s1\",\"revision\":0},\"scope\":\"selection\",\"groups\":[]}",
        "{\"schemaVersion\":1,\"binding\":{\"session\":\"s1\",\"revision\":0},\"scope\":\"complete-current-paragraph-snapshot\",\"groups\":[]}",
        "{\"schemaVersion\":1,\"binding\":{\"session\":\"s1\",\"revision\":null},\"scope\":\"selection\",\"groups\":[]}",
        "{\"schemaVersion\":1,\"binding\":{\"session\":\"s1\",\"revision\":0},\"scope\":\"selection\",\"groups\":[],\"force\":true}",
        "{\"schemaVersion\":1,\"schemaVersion\":1,\"binding\":{\"session\":\"s1\",\"revision\":0},\"scope\":\"selection\",\"groups\":[]}",
    };
    for (cases) |bytes| {
        if (decode(std.testing.allocator, bytes)) |success| {
            var candidate = success;
            candidate.deinit();
            return error.InvalidRequestAccepted;
        } else |_| {}
    }
}

test "independent text transaction request bounds JSON nesting while respecting quoted braces" {
    try checkBudget("{\"value\":\"[}\\\"\"}");
    var bytes: [m.limits.request_depth * 2 + 2]u8 = undefined;
    @memset(bytes[0 .. m.limits.request_depth + 1], '[');
    @memset(bytes[m.limits.request_depth + 1 ..], ']');
    try std.testing.expectError(error.LimitExceeded, checkBudget(&bytes));
    try std.testing.expectError(error.InvalidTextTransactionJson, checkBudget("{]"));
    try std.testing.expectError(error.InvalidTextTransactionJson, checkBudget("{\"x\":\"unterminated"));
}

test "independent text transaction coverage counts created cells as a subset of complete total" {
    const valid = "{\"schemaVersion\":1,\"binding\":{\"session\":\"s1\",\"revision\":0},\"scope\":\"complete-current-paragraph-snapshot\",\"coverage\":{\"sections\":[{\"section\":0,\"paragraphCount\":4}],\"totalParagraphs\":4,\"createdCellParagraphs\":1},\"groups\":[]}";
    var request = try decode(std.testing.allocator, valid);
    defer request.deinit();
    try std.testing.expectEqual(@as(u32, 4), request.value.coverage.?.paragraphs);
    try std.testing.expectEqual(@as(u32, 1), request.value.coverage.?.created_cell_paragraphs);
    const invalid = "{\"schemaVersion\":1,\"binding\":{\"session\":\"s1\",\"revision\":0},\"scope\":\"complete-current-paragraph-snapshot\",\"coverage\":{\"sections\":[],\"totalParagraphs\":0,\"createdCellParagraphs\":1},\"groups\":[]}";
    try std.testing.expectError(error.InvalidTextTransactionCoverage, decode(std.testing.allocator, invalid));
}
