const std = @import("std");
const snapshot = @import("hwpx/section_text_snapshot.zig");
const text = @import("hwpx/section_text.zig");

pub const roots = [_][]const u8{ "legacy/rust/crates/hwp-core/tests/fixtures", "reference/rhwp/samples" };
pub const chart_uri = "http://www.hancom.co.kr/hwpml/2016/ooxmlchart";
pub const Mode = enum { raw, selected_default, selected_chart };
const Sha256 = std.crypto.hash.sha2.Sha256;

pub fn pathDigest(bytes: []const u8) u256 {
    var output: [32]u8 = undefined;
    Sha256.hash(bytes, &output, .{});
    return std.mem.readInt(u256, &output, .big);
}

pub const Digests = struct { content: u256, ordered: u256 };

/// Canonical event-order digest shared by section and master-page corpus
/// surveys. It does not hash raw XML tags or infer rendered page text.
pub fn eventDigests(events: []const snapshot.Event, report: text.Report, master_parts: ?usize) !Digests {
    var content = Sha256.init(.{});
    var ordered = Sha256.init(.{});
    var content_bytes: usize = 0;
    var paragraph_starts: usize = 0;
    var paragraph_ends: usize = 0;
    var run_starts: usize = 0;
    var run_ends: usize = 0;
    var text_starts: usize = 0;
    var text_ends: usize = 0;
    var next_part: usize = 0;
    for (events) |event| {
        if (master_parts) |part_count| {
            if (event.location.part_kind != .master_page or event.location.part_ordinal >= part_count) return error.InvalidMasterSnapshotLocation;
            if (next_part != 0 and event.location.part_ordinal < next_part - 1) return error.InvalidMasterSnapshotLocation;
            while (next_part <= event.location.part_ordinal) : (next_part += 1) ordered.update(&.{10});
        }
        switch (event.value) {
            .paragraph_start => {
                paragraph_starts += 1;
                ordered.update(&.{1});
            },
            .paragraph_end => {
                paragraph_ends += 1;
                ordered.update(&.{2});
            },
            .run_start => {
                run_starts += 1;
                ordered.update(&.{3});
            },
            .run_end => {
                run_ends += 1;
                ordered.update(&.{4});
            },
            .text_start => {
                text_starts += 1;
                ordered.update(&.{5});
            },
            .text_end => {
                text_ends += 1;
                ordered.update(&.{6});
            },
            .inline_start => |item| ordered.update(&.{ 7, @intFromEnum(item.kind) }),
            .inline_end => |item| ordered.update(&.{ 8, @intFromEnum(item.kind) }),
            .inline_empty => |item| {
                ordered.update(&.{ 7, @intFromEnum(item.kind) });
                ordered.update(&.{ 8, @intFromEnum(item.kind) });
            },
            .content => |bytes| {
                content.update(bytes);
                content_bytes += bytes.len;
                for (bytes) |byte| ordered.update(&.{ 9, byte });
            },
        }
    }
    if (master_parts) |part_count| {
        while (next_part < part_count) : (next_part += 1) ordered.update(&.{10});
    }
    if (paragraph_starts != report.paragraphs or paragraph_ends != report.paragraphs or
        run_starts != report.runs or run_ends != report.runs or
        text_starts != report.text_elements or text_ends != report.text_elements or
        content_bytes != report.text_bytes) return error.InconsistentSnapshot;
    var content_output: [32]u8 = undefined;
    var ordered_output: [32]u8 = undefined;
    content.final(&content_output);
    ordered.final(&ordered_output);
    return .{
        .content = std.mem.readInt(u256, &content_output, .big),
        .ordered = std.mem.readInt(u256, &ordered_output, .big),
    };
}

test "HWPX snapshot corpus digest distinguishes master part placement and empty parts" {
    const first = [_]snapshot.Event{.{
        .location = .{ .section_ordinal = 0, .item_index = 0, .paragraph_ordinal = 0, .run_ordinal = 0, .text_ordinal = 0, .part_kind = .master_page, .part_ordinal = 0 },
        .value = .{ .content = "A" },
    }};
    var second = first;
    second[0].location.part_ordinal = 1;
    const report: text.Report = .{ .text_bytes = 1 };
    const left = try eventDigests(&first, report, 2);
    const right = try eventDigests(&second, report, 2);
    try std.testing.expectEqual(left.content, right.content);
    try std.testing.expect(left.ordered != right.ordered);
    const no_parts = try eventDigests(&.{}, .{}, 0);
    const empty_part = try eventDigests(&.{}, .{}, 1);
    try std.testing.expectEqual(no_parts.content, empty_part.content);
    try std.testing.expect(no_parts.ordered != empty_part.ordered);
    const reversed = [_]snapshot.Event{ second[0], first[0] };
    try std.testing.expectError(error.InvalidMasterSnapshotLocation, eventDigests(&reversed, .{ .text_bytes = 2 }, 2));
    try std.testing.expectError(error.InvalidMasterSnapshotLocation, eventDigests(&first, report, 0));
}
