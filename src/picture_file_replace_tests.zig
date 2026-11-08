const std = @import("std");
const t = std.testing;
const a = t.allocator;
const owner = @import("wasm/picture_file_replace_output.zig");
const policy = @import("image/picture_input.zig");

fn original(format: u32) ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(t.io, if (format == 1) "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwp" else "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwpx", a, .limited(policy.max_document_bytes));
}
fn target(format: u32) u32 {
    return if (format == 1) 14 else 31;
}
fn image() ![]u8 {
    return @import("image/png/pixels_fixture.zig").image(a, 77);
}

test "picture resource file 요청 길이·형식 경계는 슬라이스 없이 검사" {
    try owner.validateRequest(1, policy.max_document_bytes, policy.max_image_bytes);
    try owner.validateRequest(2, 1, 1);
    for ([_]u32{ 0, 3, std.math.maxInt(u32) }) |format| try t.expectError(error.InvalidDocumentFormat, owner.validateRequest(format, 1, 1));
    for ([_]usize{ 0, policy.max_document_bytes + 1, std.math.maxInt(usize) }) |len| try t.expectError(error.LimitExceeded, owner.validateRequest(1, len, 1));
    for ([_]usize{ 0, policy.max_image_bytes + 1, std.math.maxInt(usize) }) |len| try t.expectError(error.LimitExceeded, owner.validateRequest(2, 1, len));
}

test "picture resource file 양형식 성공·실패 출력 폐기·복구·반복 해제" {
    const png = try image();
    defer a.free(png);
    for ([_]u32{ 1, 2 }) |format| {
        const input = try original(format);
        defer a.free(input);
        var out: owner.Output = .{ .allocator = a };
        defer out.clear();
        try out.replace(format, input, 0, target(format), png);
        try t.expect(out.bytes != null);
        try t.expectError(error.InvalidDocumentFormat, out.replace(9, input, 0, target(format), png));
        try t.expect(out.bytes == null);
        try out.replace(format, input, 0, target(format), png);
        try t.expectError(error.LimitExceeded, out.replace(format, input, 0, target(format), ""));
        try t.expect(out.bytes == null);
        try out.replace(format, input, 0, target(format), png);
        out.clear();
        out.clear();
        try t.expect(out.bytes == null);
    }
}

test "picture resource file 이전 출력 alias 재입력과 대상 실패 후 복구" {
    const png = try image();
    defer a.free(png);
    for ([_]u32{ 1, 2 }) |format| {
        const input = try original(format);
        defer a.free(input);
        var out: owner.Output = .{ .allocator = a };
        defer out.clear();
        try out.replace(format, input, 0, target(format), png);
        try out.replace(format, out.bytes.?, 0, target(format), png);
        try t.expect(out.bytes != null);
        if (out.replace(format, out.bytes.?, 0, std.math.maxInt(u32), png)) |_| {
            return error.ExpectedTargetFailure;
        } else |_| {}
        try t.expect(out.bytes == null);
        try out.replace(format, input, 0, target(format), png);
    }
}

test "picture resource file 공통 이미지 검사와 HX 호환 위임" {
    const png = try image();
    defer a.free(png);
    const direct = try policy.inspectImage(png, policy.max_image_bytes);
    const delegated = try @import("hwpx/picture_resource_replacement.zig").inspectImage(png, policy.max_image_bytes);
    try t.expectEqualStrings(direct.mime, delegated.mime);
    try t.expectEqualStrings(direct.extension, delegated.extension);
    try t.expectError(error.UnsupportedReplacementImageFormat, policy.inspectImage("GIF89a", policy.max_image_bytes));
    try t.expectError(error.ImageByteLimitExceeded, policy.inspectImage(png, png.len - 1));
    png[png.len - 1] ^= 1;
    if (policy.inspectImage(png, policy.max_image_bytes)) |_| return error.ExpectedCrcFailure else |_| {}
}

fn allocationFailure(allocator: std.mem.Allocator, format: u32, input: []const u8, png: []const u8) !void {
    var out: owner.Output = .{ .allocator = allocator };
    defer out.clear();
    out.bytes = try allocator.dupe(u8, "이전 출력");
    out.replace(format, input, 0, target(format), png) catch |err| {
        try t.expect(out.bytes == null);
        return err;
    };
}

test "picture resource file H5 모든 할당 실패에서 출력·보조 문자열 해제" {
    const input = try original(1);
    defer a.free(input);
    const png = try image();
    defer a.free(png);
    try t.checkAllAllocationFailures(a, allocationFailure, .{ @as(u32, 1), input, png });
}

test "picture resource file HX 모든 할당 실패에서 출력·보조 문자열 해제" {
    const input = try original(2);
    defer a.free(input);
    const png = try image();
    defer a.free(png);
    try t.checkAllAllocationFailures(a, allocationFailure, .{ @as(u32, 2), input, png });
}

test "picture resource file 인스턴스별 출력 독립·원본 입력 불변" {
    const png = try image();
    defer a.free(png);
    const input = try original(2);
    defer a.free(input);
    const copy = try a.dupe(u8, input);
    defer a.free(copy);
    var first: owner.Output = .{ .allocator = a };
    defer first.clear();
    var second: owner.Output = .{ .allocator = a };
    defer second.clear();
    try first.replace(2, input, 0, target(2), png);
    try second.replace(2, input, 0, target(2), png);
    first.clear();
    try t.expect(second.bytes != null);
    try t.expectEqualSlices(u8, input, copy);
}

fn metadataVariant(input: []const u8, path: []const u8, value: []const u8) ![]u8 {
    var doc = try @import("hwpx/package.zig").inspectDocument(a, input, .{});
    defer doc.deinit(a);
    const zip = @import("zip/store_writer.zig");
    var sources: std.ArrayList(zip.Source) = .empty;
    defer sources.deinit(a);
    var decoded: std.ArrayList([]u8) = .empty;
    defer {
        for (decoded.items) |bytes| a.free(bytes);
        decoded.deinit(a);
    }
    for (doc.archive.entries) |entry| {
        if (std.mem.eql(u8, entry.name, path)) continue;
        const bytes = try doc.archive.decode(entry, 32 * 1024 * 1024);
        decoded.append(a, bytes) catch |err| {
            a.free(bytes);
            return err;
        };
        try sources.append(a, .{ .name = entry.name, .bytes = bytes });
    }
    try sources.append(a, .{ .name = path, .bytes = value });
    return zip.write(a, sources.items, .{});
}

test "picture resource file HX 암호화·서명 경로·추가 root·XMLDSig 거부 후 복구" {
    const input = try original(2);
    defer a.free(input);
    const png = try image();
    defer a.free(png);
    const cases = [_]struct { path: []const u8, xml: []const u8, failure: anyerror }{
        .{ .path = "META-INF/signatures.xml", .xml = "<Signature/>", .failure = error.UnsupportedPictureSecurityMetadata },
        .{ .path = "META-INF/container.rdf", .xml = "<d:Signature xmlns:d='http://www.w3.org/2000/09/xmldsig#'/>", .failure = error.SignedDocument },
        .{ .path = "META-INF/manifest.xml", .xml = "<m:manifest xmlns:m='urn:oasis:names:tc:opendocument:xmlns:manifest:1.0'><m:file-entry full-path='Contents/section0.xml'><m:encryption-data/></m:file-entry></m:manifest>", .failure = error.EncryptedDocument },
        .{ .path = "META-INF/manifest.xml", .xml = "<m:manifest xmlns:m='urn:oasis:names:tc:opendocument:xmlns:manifest:1.0'><m:file-entry m:full-path='Contents/section0.xml'><m:encryption-data/></m:file-entry></m:manifest>", .failure = error.MissingEncryptionManifestPath },
        .{ .path = "META-INF/container.xml", .xml = "<c:container xmlns:c='urn:oasis:names:tc:opendocument:xmlns:container'><c:rootfiles><c:rootfile full-path='Contents/content.hpf' media-type='application/hwpml-package+xml'/><c:rootfile full-path='Preview/PrvText.txt' media-type='application/signature+xml'/></c:rootfiles></c:container>", .failure = error.UnsupportedPicturePackageRoot },
    };
    var out: owner.Output = .{ .allocator = a };
    defer out.clear();
    for (cases) |case| {
        const derived = try metadataVariant(input, case.path, case.xml);
        defer a.free(derived);
        try out.replace(2, input, 0, target(2), png);
        try t.expectError(case.failure, out.replace(2, derived, 0, target(2), png));
        try t.expect(out.bytes == null);
    }
    try out.replace(2, input, 0, target(2), png);
}
