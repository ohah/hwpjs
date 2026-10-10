//! 가상 경계 삽입과 같은 위치의 실제 XML 교체를 단일 patch로 조립합니다.
const std = @import("std");
const writer = @import("xml_source_writer.zig");

pub fn write(a: std.mem.Allocator, source: []const u8, changes: []writer.Change, limit: usize) ![]u8 {
    var owned: std.ArrayList([]u8) = .empty;
    defer {
        for (owned.items) |bytes| a.free(bytes);
        owned.deinit(a);
    }
    var normalized: std.ArrayList(writer.Change) = .empty;
    defer normalized.deinit(a);
    var index: usize = 0;
    while (index < changes.len) {
        const first = changes[index];
        if (index + 1 < changes.len and first.start == changes[index + 1].start) {
            const second = changes[index + 1];
            const text_before_removal = first.run_opening == null and !first.expand_empty_element and first.serialized_xml == null and first.start_tag == null and second.text.len == 0 and !second.expand_empty_element and second.serialized_xml == null and second.start_tag == null;
            if (first.start != first.end or (first.run_opening == null and !text_before_removal) or second.run_opening != null or second.end <= second.start) return error.DuplicateSourceSpan;
            const left = try writer.write(a, source, &.{first}, limit);
            defer a.free(left);
            const right = try writer.write(a, source, &.{second}, limit);
            defer a.free(right);
            const left_end = left.len - (source.len - first.end);
            const right_end = right.len - (source.len - second.end);
            const joined = try std.mem.concat(a, u8, &.{ left[first.start..left_end], right[second.start..right_end] });
            owned.append(a, joined) catch |err| {
                a.free(joined);
                return err;
            };
            try normalized.append(a, .{ .start = first.start, .end = second.end, .text = "", .serialized_xml = joined });
            index += 2;
        } else {
            try normalized.append(a, first);
            index += 1;
        }
    }
    return writer.write(a, source, normalized.items, limit);
}

test "HWPX boundary patches preserve insertion order and reject ambiguous duplicates" {
    const a = std.testing.allocator;
    const source = "<p:run><p:t/></p:run>";
    const changes = [_]writer.Change{
        .{ .start = 7, .end = 7, .text = "앞😀<&", .run_opening = .{ .start = 0, .end = 7 } },
        .{ .start = 7, .end = 13, .text = "뒤", .expand_empty_element = true },
    };
    var copy = changes;
    const output = try write(a, source, &copy, 1000);
    defer a.free(output);
    try std.testing.expectEqualStrings("<p:run><p:t>앞😀&lt;&amp;</p:t><p:t>뒤</p:t></p:run>", output);
    var ambiguous = [_]writer.Change{ changes[1], changes[1] };
    try std.testing.expectError(error.DuplicateSourceSpan, write(a, source, &ambiguous, 1000));
    const tab_source = "<p:t><p:tab width='100'/></p:t>";
    var tab_changes = [_]writer.Change{
        .{ .start = 5, .end = 5, .text = "한😀<&" },
        .{ .start = 5, .end = std.mem.indexOf(u8, tab_source, "</p:t>").?, .text = "" },
    };
    const tab_output = try write(a, tab_source, &tab_changes, 1000);
    defer a.free(tab_output);
    try std.testing.expectEqualStrings("<p:t>한😀&lt;&amp;</p:t>", tab_output);
    var uncertain = tab_changes;
    uncertain[1].text = "replacement";
    try std.testing.expectError(error.DuplicateSourceSpan, write(a, tab_source, &uncertain, 1000));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: []const u8, patches: []const writer.Change) !void {
            const owned_changes = try allocator.dupe(writer.Change, patches);
            defer allocator.free(owned_changes);
            const result = try write(allocator, input, owned_changes, 1000);
            defer allocator.free(result);
        }
    }.run, .{ source, &changes });
}
