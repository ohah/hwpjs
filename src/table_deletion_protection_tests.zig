const std = @import("std");
const a = std.testing.allocator;
const fixture = @import("hwpx/test_package_fixture.zig");
const parser = @import("hwpx/section_tree.zig");
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const simple = prefix ++ "<p:p><p:run><p:t>유지</p:t><p:tbl/></p:run></p:p></s:sec>";

fn tableNode(tree: *const parser.Tree) usize {
    for (tree.elements, 0..) |_, i| if (@import("hwpx/table_xml_fields.zig").childIs(tree, i, "tbl")) return i;
    unreachable;
}

fn refused(expected: anyerror, result: anyerror![]u8) !void {
    if (result) |bytes| {
        a.free(bytes);
        return error.ExpectedProtectionRejection;
    } else |err| try std.testing.expectEqual(expected, err);
}

test "표 삭제 보호 HX 문단 사이 hyperlink 안의 표는 거부" {
    const source = prefix ++ "<p:p><p:run><p:ctrl><p:fieldBegin id='7' type='HYPERLINK'/></p:ctrl><p:t>앞</p:t></p:run></p:p><p:p><p:run><p:t>본문</p:t><p:tbl/></p:run></p:p><p:p><p:run><p:ctrl><p:fieldEnd beginIDRef='7'/></p:ctrl></p:run></p:p></s:sec>";
    var tree = try parser.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    if (@import("hwpx/table_deletion.zig").prepareMany(a, &tree, &.{tableNode(&tree)}, 100000)) |owned| {
        var candidate = owned;
        candidate.deinit(a);
        return error.ExpectedProtectionRejection;
    } else |err| try std.testing.expectEqual(error.ProtectedFieldRange, err);
}

fn withSignature() ![]u8 {
    const input = try fixture.syntheticStructureZip(a, fixture.structure_header, simple);
    defer a.free(input);
    var doc = try @import("hwpx/package.zig").inspectDocument(a, input, .{});
    defer doc.deinit(a);
    var rows: std.ArrayList(fixture.Source) = .empty;
    defer rows.deinit(a);
    var decoded: std.ArrayList([]u8) = .empty;
    defer {
        for (decoded.items) |bytes| a.free(bytes);
        decoded.deinit(a);
    }
    for (doc.archive.entries) |entry| {
        const bytes = try doc.archive.decode(entry, 100000);
        decoded.append(a, bytes) catch |err| {
            a.free(bytes);
            return err;
        };
        try rows.append(a, .{ .name = entry.name, .data = bytes });
    }
    try rows.append(a, .{ .name = "META-INF/signatures.xml", .data = "<ds:Signatures xmlns:ds='http://www.w3.org/2000/09/xmldsig#'><ds:Signature/></ds:Signatures>" });
    return fixture.storedZip(a, rows.items);
}

fn target(input: []const u8) !usize {
    var document = try @import("hwpx/package.zig").inspectDocument(a, input, .{});
    defer document.deinit(a);
    var tree = try document.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    return tableNode(&tree);
}

test "표 삭제 보호 HX 서명 파트가 있는 파일 변환은 거부" {
    const input = try withSignature();
    defer a.free(input);
    const node = try target(input);
    try refused(error.UnsupportedPictureSecurityMetadata, @import("hwpx/table_deletion_file.zig").transform(a, input, 0, &.{node}, .{}));
}

test "표 삭제 보호 HX header XMLDSig가 있는 파일 변환은 거부" {
    const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' version='1.5' secCnt='2'><ds:Signature xmlns:ds='http://www.w3.org/2000/09/xmldsig#'/></h:head>";
    const input = try fixture.syntheticStructureZip(a, header, simple);
    defer a.free(input);
    const node = try target(input);
    try refused(error.SignedDocument, @import("hwpx/table_deletion_file.zig").transform(a, input, 0, &.{node}, .{}));
}
