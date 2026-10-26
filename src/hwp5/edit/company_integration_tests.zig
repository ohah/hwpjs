//! 실제 Company 파일의 보호/Session/변조/OOM 계약. 아직 실행되지 않은 후보다.
const std = @import("std");
const Session = @import("style_preservation.zig").Session;
const History = @import("editor_history.zig").History;
fn input(a: std.mem.Allocator) ![]u8 {
    const bytes = try @import("company_reference_fixture.zig").company(a);
    errdefer a.free(bytes);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &digest, .{});
    try std.testing.expectEqualStrings("cc8668819b79ed51408a93c0ad7876569bf67e8fed56dbfb7febdd0c9a91cded", &std.fmt.bytesToHex(digest, .lower));
    return bytes;
}
fn savedEquals(session: *Session, bytes: []const u8) !void {
    const result = try session.save(std.testing.allocator, .{ .allow_stale_layout = true });
    defer std.testing.allocator.free(result.bytes);
    try std.testing.expectEqualSlices(u8, bytes, result.bytes);
}
test "Company isolated actual body 3 6 8 history save reopen and protected row 60" {
    const a = std.testing.allocator;
    const bytes = try input(a);
    defer a.free(bytes);
    for ([_]usize{ 3, 6, 8 }) |target| {
        const session = try Session.open(a, bytes);
        defer session.close();
        var plan = try session.textSourceProtection(a, 0);
        defer plan.deinit(a);
        try std.testing.expectEqual(.retained_company, plan.mode);
        try std.testing.expect(!plan.protected_paragraphs[target]);
        try std.testing.expect(plan.protected_paragraphs[60]);
        var history = try History.init(a, session, 8, 16_000_000);
        defer history.deinit();
        const before = try session.copyText(a, 0, target);
        defer a.free(before);
        _ = try history.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = target, .start_unit = 0, .end_unit = 0, .utf8 = "검증😀" } });
        const edited = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(edited.bytes);
        const reopened = try Session.open(a, edited.bytes);
        defer reopened.close();
        const current = try session.copyText(a, 0, target);
        defer a.free(current);
        const recovered = try reopened.copyText(a, 0, target);
        defer a.free(recovered);
        try std.testing.expectEqualSlices(u8, current, recovered);
        try std.testing.expect(current.len > before.len);
        try std.testing.expect(try history.undo(session));
        try savedEquals(session, bytes);
        try std.testing.expect(try history.redo(session));
        try savedEquals(session, edited.bytes);
        for ([_]u32{ 0, 8, 16, 24 }) |position| {
            try std.testing.expectError(error.ProtectedRetainedCompanyParagraph, session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 60, .start_unit = position, .end_unit = position, .utf8 = "금지" } }));
            try savedEquals(session, edited.bytes);
        }
    }
}
test "Company isolated raw flags command end identity and cross paragraph attacks refuse" {
    const a = std.testing.allocator;
    const bytes = try input(a);
    defer a.free(bytes);
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const decoded = try source.decodeSection(a, 0);
    defer a.free(decoded);
    const version = source.header.version();
    const owner = try @import("company_source.zig").owner(a, decoded, version);
    var protection = try @import("../body/retained_extended_field.zig").read(a, decoded, version, owner);
    defer protection.deinit(a);
    const field = protection.fields[0];
    const header_offset = @intFromPtr(field.raw_header.ptr) - @intFromPtr(decoded.ptr);
    const text_offset = @intFromPtr(protection.text.ptr) - @intFromPtr(decoded.ptr);
    // 실제 원문 위치/길이로 변조한다. 원본 offset을 임의 fixture에 고정하지 않는다.
    const changes = [_]struct { offset: usize, value: u8 }{
        .{ .offset = header_offset + 8, .value = 1 }, // attributes
        .{ .offset = header_offset + 12, .value = 0 }, // other8 제거
        .{ .offset = header_offset + field.raw_header.len - 1, .value = 1 }, // extra 변조
        .{ .offset = header_offset + 15, .value = '!' }, // command 첫 byte
        .{ .offset = text_offset + field.end_control.start * 2 + 2, .value = 0 }, // end identity
        .{ .offset = text_offset + field.end_control.start * 2, .value = 13 }, // 종결 대신 문단 끝
        .{ .offset = header_offset + 4, .value = '?' }, // 원래 usr identity 변조
    };
    for (changes) |change| {
        const corrupt = try a.dupe(u8, decoded);
        defer a.free(corrupt);
        corrupt[change.offset] = change.value;
        if (@import("company_source.zig").owner(a, corrupt, version)) |_| return error.AcceptedCorruptCompany else |err| {
            try std.testing.expect(err != error.OutOfMemory);
        }
    }
}
fn attempt(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, baseline: @import("../../model/document.zig").Section) !void {
    var current = try @import("../../model/clone.zig").section(a, baseline);
    defer current.deinit(a);
    @import("company_splice.zig").apply(a, source, version, &current, .{ .section = 0, .paragraph = 3, .start_unit = 0, .end_unit = 0, .utf8 = "원자성😀" }, 65536) catch |err| {
        // 비교는 allocation-free이며 실패 allocator를 observer에 재사용하지 않는다.
        try std.testing.expect(@import("../../model/equality.zig").semantic(@import("../../model/document.zig").Section, baseline, current));
        return err;
    };
    var plan = try @import("company_text_protection.zig").read(a, source, version, current);
    defer plan.deinit(a);
    try std.testing.expect(plan.protected_paragraphs[60]);
}
test "Company isolated every allocation failure preserves whole section with real allocator controls" {
    const a = std.testing.allocator;
    const bytes = try input(a);
    defer a.free(bytes);
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const decoded = try source.decodeSection(a, 0);
    defer a.free(decoded);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{decoded});
    defer document.deinit(a);
    try @import("../../testing/allocation_failures.zig").check(attempt, .{ decoded, source.header.version(), document.sections[0] });
}

test "Company isolated forged current owner and protected model reject" {
    const a = std.testing.allocator;
    const bytes = try input(a);
    defer a.free(bytes);
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const decoded = try source.decodeSection(a, 0);
    defer a.free(decoded);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{decoded});
    defer document.deinit(a);
    var section = try @import("../../model/clone.zig").section(a, document.sections[0]);
    defer section.deinit(a);
    section.paragraphs[3].source_node = section.paragraphs[60].source_node;
    try std.testing.expectError(error.SourceBindingMismatch, @import("company_text_protection.zig").read(a, decoded, source.header.version(), section));
    section.paragraphs[3].source_node = document.sections[0].paragraphs[3].source_node;
    section.paragraphs[60].style_id += 1;
    try std.testing.expectError(error.SourceBindingMismatch, @import("company_text_protection.zig").read(a, decoded, source.header.version(), section));
}
