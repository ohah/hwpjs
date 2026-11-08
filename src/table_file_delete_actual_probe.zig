//! 공식 Noori 두 형식에서 공통 출력 소유자와 기존 파일 변환기를 함께 검사한다.
const std = @import("std");
const owner = @import("wasm/table_file_delete_output.zig");
const a = std.testing.allocator;
const Stats = struct { count: usize = 0, first: ?u32 = null };

fn inspect(format: u32, bytes: []const u8) !Stats {
    var result: Stats = .{};
    if (format == 1) {
        var source = try @import("hwp5/text_source.zig").Source.open(a, bytes);
        defer source.deinit();
        const raw = try source.decodeSection(a, 0);
        defer a.free(raw);
        var tree = try @import("hwp5/body/tree.zig").Tree.parseTextPreview(a, raw, source.header.version(), .{});
        defer tree.deinit(a);
        for (tree.nodes, 0..) |node, i| if (node.record.framing.tag == 77) {
            if (result.first == null) result.first = @intCast(i);
            result.count += 1;
        };
    } else {
        var document = try @import("hwpx/package.zig").inspectDocument(a, bytes, .{});
        defer document.deinit(a);
        var structure = try document.inspectStructure(a, .{});
        defer structure.deinit(a);
        const item = structure.sections[0].item_index;
        const entry = document.manifest.items[item].entry_index.?;
        const xml = try document.archive.decode(document.archive.entries[entry], 32 * 1024 * 1024);
        defer a.free(xml);
        var tree = try @import("hwpx/section_tree.zig").parse(a, xml, 0, item, .{});
        defer tree.deinit(a);
        for (tree.elements, 0..) |_, i| if (@import("hwpx/table_xml_fields.zig").childIs(&tree, i, "tbl")) {
            if (result.first == null) result.first = @intCast(i);
            result.count += 1;
        };
    }
    return result;
}

fn unchanged(format: u32, input: []const u8, output: []const u8) !usize {
    var kept: usize = 0;
    if (format == 1) {
        var before = try @import("hwp5/text_source.zig").Source.open(a, input);
        defer before.deinit();
        var after = try @import("hwp5/text_source.zig").Source.open(a, output);
        defer after.deinit();
        for (before.file.entries, 0..) |entry, i| {
            if (entry.kind != 2) continue;
            const path = try before.file.rootRelativePath(i);
            if (std.mem.eql(u8, path, "/BodyText/Section0")) continue;
            const current = (try after.file.findExact(path)) orelse return error.UnrelatedStreamMissing;
            try std.testing.expectEqualSlices(u8, entry.content, after.file.entries[current].content);
            kept += 1;
        }
    } else {
        var before = try @import("hwpx/package.zig").inspectDocument(a, input, .{});
        defer before.deinit(a);
        var after = try @import("hwpx/package.zig").inspectDocument(a, output, .{});
        defer after.deinit(a);
        var structure = try before.inspectStructure(a, .{});
        defer structure.deinit(a);
        const entry = before.manifest.items[structure.sections[0].item_index].entry_index.?;
        const selected = before.archive.entries[entry].name;
        try std.testing.expectEqual(before.archive.entries.len, after.archive.entries.len);
        for (before.archive.entries) |old| {
            if (std.mem.eql(u8, old.name, selected)) continue;
            const current = after.archive.find(old.name) orelse return error.UnrelatedZipEntryMissing;
            try std.testing.expectEqual(old.crc32, current.crc32);
            try std.testing.expectEqualSlices(u8, old.compressed, current.compressed);
            kept += 1;
        }
    }
    return kept;
}

fn run(format: u32, suffix: []const u8) !void {
    const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/noori.{s}", .{suffix});
    defer a.free(path);
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(owner.max_document_bytes));
    defer a.free(input);
    const snapshot = try a.dupe(u8, input);
    defer a.free(snapshot);
    const before = try inspect(format, input);
    const targets = [_]u32{before.first orelse return error.NoTableObserved};
    try std.testing.expectEqual(@as(u32, if (format == 1) 20 else 59), targets[0]);
    var output: owner.Output = .{ .allocator = a };
    defer output.clear();
    var request: owner.Request = .{ .format = format, .input_ptr = input.ptr, .input_len = input.len, .section = 0, .targets_ptr = &targets, .targets_len = 1 };
    try output.replace(request);
    try std.testing.expect(output.ptr() != 0 and output.len() > 0 and output.len() <= owner.max_document_bytes);
    const after = try inspect(format, output.bytes.?);
    try std.testing.expectEqual(before.count - 1, after.count);
    _ = try unchanged(format, input, output.bytes.?);
    // 이전 출력 자체를 다시 문서 입력으로 전달해 두 번째 표를 삭제한다.
    const next = [_]u32{after.first orelse return error.NoSecondTableObserved};
    request.input_ptr = output.bytes.?.ptr;
    request.input_len = output.bytes.?.len;
    request.targets_ptr = &next;
    try output.replace(request);
    const twice = try inspect(format, output.bytes.?);
    try std.testing.expectEqual(after.count - 1, twice.count);
    // 유효 대상 뒤의 잘못된 대상 때문에 실패해도 출력은 게시되지 않는다.
    const invalid = [_]u32{ twice.first orelse return error.NoRemainingTableObserved, std.math.maxInt(u32) };
    request.input_ptr = output.bytes.?.ptr;
    request.input_len = output.bytes.?.len;
    request.targets_ptr = &invalid;
    request.targets_len = invalid.len;
    if (output.replace(request)) |_| return error.TestUnexpectedResult else |err| {
        if (err == error.OutOfMemory) return err;
    }
    try std.testing.expectEqual(@as(usize, 0), output.ptr());
    try std.testing.expectEqual(@as(usize, 0), output.len());
    output.clear();
    output.clear();
    try std.testing.expectEqualSlices(u8, snapshot, input);
}

test "표 파일 삭제 실물 HWP5 출력 소유권 별칭과 실패 원자성" {
    try run(1, "hwp");
}
test "표 파일 삭제 실물 HWPX 출력 소유권 별칭과 실패 원자성" {
    try run(2, "hwpx");
}
