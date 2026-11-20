//! Default-factory regression candidates. These exercise real serializers, not
//! a separately modernized fixture. Native execution still needs a new grant.
const std = @import("std");
const a = std.testing.allocator;
const root = @import("root.zig");
const edit = @import("../hwp5/edit/style_preservation.zig");
const History = @import("../hwp5/edit/editor_history.zig").History;

const creationOptions = @import("hwp5_profile_test_options.zig").creationOptions;

test "new document modern default generated H5 table save reopen and single owned history" {
    const source = try root.hwp5(a);
    defer a.free(source);
    const s = try edit.Session.open(a, source);
    defer s.close();
    var ids = try s.planTableIdsWithAllocator(a, 1);
    defer ids.deinit(a);
    var table = try @import("../model/created_table.zig").create(a, ids.identity, ids.instance_id, try @import("../model/table_creation_plan.zig").create(1, 1, 18000, 1800, 1), ids.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 0 }, 1);
    defer table.deinit(a);
    _ = try table.replaceText(a, 0, 0, "현대😀", 100);
    var history = try History.initV2(a, s, .{});
    defer history.deinit();
    try std.testing.expect(try history.apply(s, .{ .stage_table = .{
        .section = 0,
        .paragraph = 0,
        .unit = 16,
        .table = &table,
        .options = creationOptions(),
    } }));
    try std.testing.expectEqual(@as(u32, 1), history.revision());
    const saved = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    try std.testing.expectEqual(@as(u32, 0x05000300), reopened.fileVersion());
    var raw = try @import("../hwp5/text_source.zig").Source.open(a, saved.bytes);
    defer raw.deinit();
    const body = try raw.decodeSection(a, 0);
    defer a.free(body);
    var records = @import("../hwp5/record.zig").Iterator.init(body, .{});
    var tables: usize = 0;
    while (try records.next()) |record| if (record.tag == 77) {
        const actual = try @import("../hwp5/body/table.zig").Table.parse(record.payload, raw.header.version());
        try std.testing.expectEqual(@as(u16, 1), actual.row_count);
        try std.testing.expectEqual(@as(u16, 1), actual.column_count);
        tables += 1;
    };
    try std.testing.expectEqual(@as(usize, 1), tables);
    try std.testing.expect(try history.undo(s));
    const undone = try s.save(a, .{});
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, source, undone.bytes);
    try std.testing.expect(try history.redo(s));
    const redone = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
}

test "new document modern default page settings and empty equation query retain history ownership" {
    const source = try root.hwp5(a);
    defer a.free(source);
    const s = try edit.Session.open(a, source);
    defer s.close();
    s.enableHistoryDelta();
    var history = try History.initV2(a, s, .{});
    defer history.deinit();
    const query = try s.equationSnapshot(a, 0, .version_only);
    defer a.free(query);
    var parsed = try std.json.parseFromSlice(std.json.Value, a, query, .{});
    defer parsed.deinit();
    try std.testing.expectEqual(@as(usize, 0), parsed.value.object.get("sources").?.array.items.len);
    try std.testing.expectEqual(@as(u32, 0), history.revision());
    const t = @import("../hwp5/edit/page_settings_types.zig");
    const targets = [_]t.Target{.{ .section = 0, .expected = try s.pageSettings(a, 0) }};
    const request: t.Request = .{
        .binding = .{ .session = "new-document-profile-test", .revision = 0, .serial = "0" },
        .scope = .section,
        .targets = &targets,
        .values = .{ .orientation = .narrowly, .width = 64800, .height = 86400, .gutter_type = .top_bottom, .margin = .{ .header = 1800, .footer = 1800, .gutter = 720, .left = 7200, .right = 3600, .top = 3600, .bottom = 5400 } },
    };
    try std.testing.expect(try history.apply(s, .{ .edit_page_settings = &request }));
    const saved = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    try std.testing.expectEqual(@as(u32, 0x05000300), reopened.fileVersion());
    const page = try reopened.pageSettings(a, 0);
    try std.testing.expectEqual(@as(u32, 64800), page.width);
    try std.testing.expectEqual(@as(u32, 86400), page.height);
    try std.testing.expect(try history.undo(s));
    const undone = try s.save(a, .{});
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, source, undone.bytes);
    try std.testing.expect(try history.redo(s));
    const redone = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
}

test "new document modern default split body image insertion keeps profile and resource ownership" {
    const source = try root.hwp5(a);
    defer a.free(source);
    const s = try edit.Session.open(a, source);
    defer s.close();
    try s.apply(.{ .split_paragraph = .{ .section = 0, .paragraph = 0, .at_unit = 16 } });
    const split = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(split.bytes);
    const png = try @import("../image/png/pixels_fixture.zig").image(a, 77);
    defer a.free(png);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(split.bytes, &digest, .{});
    var result = try @import("../hwp5/edit/image_insertion_file.zig").prepare(a, split.bytes, png, .{
        .expected_source_sha256 = digest,
        .target = .{ .section = 0, .paragraph = 1, .unit = 0 },
        .expected_text = "\r",
        .width = 7200,
        .height = 3600,
    });
    defer result.deinit(a);
    const reopened = try edit.Session.open(a, result.bytes);
    defer reopened.close();
    try std.testing.expectEqual(@as(u32, 0x05000300), reopened.fileVersion());
    var raw = try @import("../hwp5/text_source.zig").Source.open(a, result.bytes);
    defer raw.deinit();
    const body = try raw.decodeSection(a, 0);
    defer a.free(body);
    const pictures = try @import("../hwp5/edit/picture_sources.zig").read(a, body, raw.header.version(), .base73);
    defer a.free(pictures);
    try std.testing.expectEqual(@as(usize, 1), pictures.len);
    const again = try reopened.save(a, .{ .allow_stale_layout = true });
    defer a.free(again.bytes);
    try std.testing.expectEqualSlices(u8, result.bytes, again.bytes);
}
