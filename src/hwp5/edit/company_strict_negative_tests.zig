//! 이미 통과한4건 snapshot과 별도인 추가 검사. 실행 증거는 아직 없다.
const std = @import("std");
const Version = @import("../version.zig").Version;

test "Company isolated actual revision deletion sources remain refused" {
    const a = std.testing.allocator;
    const bytes = try @import("company_reference_fixture.zig").load(a, "reference/rhwp/samples/task2287/1342000_edu_curriculum_map.hwp", "623b00d56beffc45d27c5bf23911bdc49d3a541ded8aecbb323d0716a2bc9f4e");
    defer a.free(bytes);
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    for ([_]usize{ 15, 16, 17 }) |index| {
        const decoded = try source.decodeSection(a, index);
        defer a.free(decoded);
        try std.testing.expectError(error.UnsupportedSectionControl, @import("company_source.zig").owner(a, decoded, source.header.version()));
    }
}

fn movedEnd(a: std.mem.Allocator, source: []const u8, version: Version, protection: @import("../body/retained_extended_field.zig").Protection) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    const end = protection.fields[0].end_control;
    const marker = protection.text[end.start * 2 .. end.end * 2];
    var it = @import("../record.zig").Iterator.init(source, .{});
    var paragraph: usize = std.math.maxInt(usize);
    while (try it.next()) |record| {
        if (record.tag == 66) paragraph = if (paragraph == std.math.maxInt(usize)) 0 else paragraph + 1;
        if (paragraph != 60 and paragraph != 61) {
            try out.appendSlice(a, record.raw);
            continue;
        }
        if (record.tag == 69) continue; // 원래 line cache는 새 text counts와 함께 제거한다.
        const payload = try a.dupe(u8, record.payload);
        defer a.free(payload);
        if (record.tag == 66) {
            const Header = @import("../body/paragraph_header.zig").Header;
            const header = try Header.parse(payload, version);
            Header.writeTextCounts(payload, if (paragraph == 60) header.characterUnits() - 8 else header.characterUnits() + 8, header.char_shape_count, header.range_tag_count);
            if (paragraph == 61) std.mem.writeInt(u32, payload[4..8], header.control_mask | (@as(u32, 1) << 4), .little);
        }
        if (record.tag == 67) {
            var text: std.ArrayList(u8) = .empty;
            defer text.deinit(a);
            if (paragraph == 60) {
                try text.appendSlice(a, payload[0 .. end.start * 2]);
                try text.appendSlice(a, payload[end.end * 2 ..]);
            } else {
                try text.appendSlice(a, marker);
                try text.appendSlice(a, payload);
            }
            try @import("../record_writer.zig").append(a, &out, record.tag, record.level, text.items, 32_000_000);
        } else try @import("../record_writer.zig").append(a, &out, record.tag, record.level, payload, 32_000_000);
    }
    return out.toOwnedSlice(a);
}

test "Company isolated complete record framing with actual end moved across paragraph rejects" {
    const a = std.testing.allocator;
    const bytes = try @import("company_reference_fixture.zig").company(a);
    defer a.free(bytes);
    var file = try @import("../text_source.zig").Source.open(a, bytes);
    defer file.deinit();
    const decoded = try file.decodeSection(a, 0);
    defer a.free(decoded);
    const version = file.header.version();
    const owner = try @import("company_source.zig").owner(a, decoded, version);
    var protection = try @import("../body/retained_extended_field.zig").read(a, decoded, version, owner);
    defer protection.deinit(a);
    const crossed = try movedEnd(a, decoded, version, protection);
    defer a.free(crossed);
    // framing과 변경 paragraph의 text/header count가 성립한 뒤 소유권 거부를 확인한다.
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, crossed, version, .{});
    defer tree.deinit(a);
    for (tree.nodes, 0..) |node, index| {
        if (node.record.value != .header) continue;
        const parts = try @import("../body/paragraph_children.zig").collect(tree, index);
        if (parts.text_node) |text_node| try tree.nodes[text_node].record.value.text.validateCount(node.record.value.header);
    }
    if (@import("company_source.zig").owner(a, crossed, version)) |_| return error.AcceptedCrossParagraphCompany else |err| {
        try std.testing.expect(err != error.OutOfMemory);
    }
}
