//! Query transport only. Coordinates are selectors, not issued edit permission.
const std = @import("std");
const m = @import("../model/text_transaction.zig");
const formatting = @import("../model/formatting_patch.zig");
const fields = @import("formatting_patch_request.zig");
pub const Query = struct { binding: formatting.Binding, owners: []const formatting.Owner };
pub const Request = struct {
    arena: std.heap.ArenaAllocator,
    value: Query,
    pub fn deinit(self: *Request) void {
        self.arena.deinit();
        self.* = undefined;
    }
};

pub fn decode(a: std.mem.Allocator, bytes: []const u8) !Request {
    try @import("text_transaction_request.zig").checkBudget(bytes);
    var arena = std.heap.ArenaAllocator.init(a);
    errdefer arena.deinit();
    const aa = arena.allocator();
    const root = try std.json.parseFromSliceLeaky(std.json.Value, aa, bytes, .{ .allocate = .alloc_always, .duplicate_field_behavior = .@"error", .max_value_len = m.limits.request_bytes });
    try fields.keys(root, &.{ "schemaVersion", "binding", "selectors" });
    if (try fields.uint(try fields.required(root, "schemaVersion"), 0xffffffff) != 1) return error.InvalidTextTransactionSchema;
    const binding = try fields.decodeBinding(try fields.required(root, "binding"), false);
    const selectors = try fields.array(try fields.required(root, "selectors"));
    if (selectors.len > m.limits.groups) return error.LimitExceeded;
    const owners = try aa.alloc(formatting.Owner, selectors.len);
    var seen: std.AutoHashMapUnmanaged(formatting.Owner, void) = .empty;
    try seen.ensureTotalCapacity(aa, @intCast(selectors.len));
    for (selectors, owners) |selector, *owner| {
        try fields.keys(selector, &.{ "section", "paragraph" });
        owner.* = .{
            .section = @intCast(try fields.uint(try fields.required(selector, "section"), 0xffffffff)),
            .paragraph = @intCast(try fields.uint(try fields.required(selector, "paragraph"), 0xffffffff)),
        };
        if (seen.getOrPutAssumeCapacity(owner.*).found_existing) return error.DuplicateTextTransactionTarget;
    }
    return .{ .arena = arena, .value = .{ .binding = binding, .owners = owners } };
}

const example = "{\"schemaVersion\":1,\"binding\":{\"session\":\"s1\",\"revision\":7},\"selectors\":[{\"section\":0,\"paragraph\":2},{\"section\":1,\"paragraph\":5}]}";
test "independent text query request owns source selectors and survives input retirement with OOM cleanup" {
    const a = std.testing.allocator;
    const input = try a.dupe(u8, example);
    defer a.free(input);
    var request = try decode(a, input);
    defer request.deinit();
    @memset(input, ' ');
    try std.testing.expectEqualStrings("s1", request.value.binding.session);
    try std.testing.expectEqual(@as(?u32, 7), request.value.binding.revision);
    try std.testing.expectEqual(@as(usize, 5), request.value.owners[1].paragraph);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            var candidate = try decode(allocator, example);
            defer candidate.deinit();
        }
    }.run, .{});
}

test "independent text query request allows empty coverage query but rejects malformed or duplicate selectors" {
    const empty = "{\"schemaVersion\":1,\"binding\":{\"session\":\"s1\",\"revision\":0},\"selectors\":[]}";
    var request = try decode(std.testing.allocator, empty);
    defer request.deinit();
    try std.testing.expectEqual(@as(usize, 0), request.value.owners.len);
    const invalid = [_][]const u8{
        "{\"schemaVersion\":2,\"binding\":{\"session\":\"s1\",\"revision\":0},\"selectors\":[]}",
        "{\"schemaVersion\":1,\"binding\":{\"session\":\"s1\",\"revision\":null},\"selectors\":[]}",
        "{\"schemaVersion\":1,\"binding\":{\"session\":\"s1\",\"revision\":0},\"selectors\":[],\"force\":true}",
        "{\"schemaVersion\":1,\"binding\":{\"session\":\"s1\",\"revision\":0},\"selectors\":[{\"section\":0,\"paragraph\":1},{\"section\":0,\"paragraph\":1}]}",
        "{\"schemaVersion\":1,\"binding\":{\"session\":\"s1\",\"revision\":0},\"selectors\":[{\"section\":0,\"paragraph\":4294967296}]}",
        "{\"schemaVersion\":1,\"binding\":{\"session\":\"s1\",\"revision\":0},\"selectors\":[{\"section\":0,\"paragraph\":0,\"ref\":\"forged\"}]}",
        "{\"schemaVersion\":1,\"schemaVersion\":1,\"binding\":{\"session\":\"s1\",\"revision\":0},\"selectors\":[]}",
    };
    for (invalid) |bytes| {
        if (decode(std.testing.allocator, bytes)) |success| {
            var unexpected = success;
            unexpected.deinit();
            return error.InvalidQueryAccepted;
        } else |_| {}
    }
}
