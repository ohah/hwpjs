//! Public transport owns no session pointers, physical nodes or history authority.
const std = @import("std");
const placement = @import("inline_object_placement.zig");
const insertion = @import("inline_object_insert.zig");
pub const Target = struct {
    section: usize,
    paragraph: usize = 0,
    owner: placement.Owner,
    unit: u32,
    expected_text: []const u8,
    affinity: @FieldType(insertion.Target, "affinity") = .forward,
    pub fn native(self: Target) insertion.Target {
        return .{ .section = self.section, .paragraph = self.paragraph, .owner = self.owner, .unit = self.unit, .expected_text = self.expected_text, .affinity = self.affinity };
    }
};
pub const Request = struct {
    target: Target,
    kind: @import("note_bodies.zig").Kind,
    resources: @import("note_create_profile.zig").Resources,
    format: @import("note_create_profile.zig").Format,
    body: []const u8,
    initial_policies: []const @import("note_create_policy.zig").Initial = &.{},
};
pub fn parse(a: std.mem.Allocator, bytes: []const u8) !std.json.Parsed(Request) {
    if (bytes.len == 0 or bytes.len > 2 * 1024 * 1024) return error.LimitExceeded;
    const raw = try std.json.parseFromSlice(std.json.Value, a, bytes, .{ .duplicate_field_behavior = .@"error" });
    defer raw.deinit();
    if (raw.value != .object) return error.InvalidNoteCreateRequest;
    const target = raw.value.object.get("target") orelse return error.InvalidNoteCreateOwner;
    if ((try placement.wireAddress(target)) == null) return error.InvalidNoteCreateOwner;
    const unit = target.object.get("unit") orelse return error.InvalidNoteCreateRequest;
    try placement.wireUnsigned(unit);
    const parsed = try std.json.parseFromSlice(Request, a, bytes, .{ .allocate = .alloc_always, .ignore_unknown_fields = false, .duplicate_field_behavior = .@"error" });
    errdefer parsed.deinit();
    if (parsed.value.body.len > 1024 * 1024) return error.LimitExceeded;
    _ = try @import("../image/image_insertion.zig").byteOffset(parsed.value.target.expected_text, parsed.value.target.unit);
    return parsed;
}

const sample = "{\"target\":{\"section\":0,\"paragraph\":1,\"unit\":1,\"expected_text\":\"a😀b\",\"owner\":{\"kind\":\"body\",\"binding\":{\"session\":\"s1\",\"revision\":0,\"serial\":\"0\"}}},\"kind\":\"foot\",\"resources\":{\"paragraph\":0,\"character\":0,\"style\":0},\"format\":{\"number_type\":\"DIGIT\",\"user_char\":\"\",\"prefix_char\":\"\",\"suffix_char\":\")\",\"superscript\":false},\"body\":\"\\ufffc새😀\\r\\n\\t뒤\\ufffc\"}";
fn parseSample(a: std.mem.Allocator) !void {
    const result = try parse(a, sample);
    defer result.deinit();
    try std.testing.expectEqualStrings("\xef\xbf\xbc새😀\r\n\t뒤\xef\xbf\xbc", result.value.body);
    try std.testing.expectEqual(@as(u32, 1), result.value.target.unit);
    const native = result.value.target.native();
    try std.testing.expectEqual(@as(u32, 1), native.unit);
    try std.testing.expectEqual(@as(?usize, null), native.physical_paragraph);
    try std.testing.expect(!native.anchor_insertion);
    try std.testing.expectEqual(placement.Kind.body, result.value.target.owner.kind);
    try std.testing.expectEqual(@as(usize, 0), result.value.initial_policies.len);
}
test "HWPX N02 public note request preserves exact body and owner without internal lease" {
    try parseSample(std.testing.allocator);
}
test "HWPX N02 public note request rejects internal targets floating positions and duplicate keys" {
    const a = std.testing.allocator;
    const cases = [_]struct { before: []const u8, after: []const u8 }{
        .{ .before = "\"unit\":1", .after = "\"unit\":1.0" },
        .{ .before = "\"unit\":1", .after = "\"unit\":2" },
        .{ .before = "\"unit\":1", .after = "\"unit\":1,\"physical_paragraph\":2" },
        .{ .before = "\"kind\":\"foot\"", .after = "\"kind\":\"foot\",\"kind\":\"end\"" },
    };
    for (cases) |item| {
        const bytes = try std.mem.replaceOwned(u8, a, sample, item.before, item.after);
        defer a.free(bytes);
        if (parse(a, bytes)) |result| {
            result.deinit();
            return error.TestExpectedError;
        } else |err| {
            if (err == error.OutOfMemory) return err;
        }
    }
}
test "HWPX N02 public note request allocation failures release parse ownership" {
    try @import("../testing/allocation_failures.zig").check(parseSample, .{});
}
