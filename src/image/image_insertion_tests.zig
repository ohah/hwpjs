const std = @import("std");
const t = std.testing;
const insertion = @import("image_insertion.zig");

fn request() insertion.Request {
    return .{ .expected_source_sha256 = @splat(0), .target = .{ .section = 0, .paragraph = 0, .unit = 0 }, .expected_text = "가😀나\r", .width = 59528, .height = 10000 };
}

test "image insertion 공통 HWPUNIT 원값 유지와 기하 범위" {
    var value = request();
    try t.expectEqualDeep(insertion.Size{ .width = 59528, .height = 10000 }, try insertion.size(value));
    value.width = 1;
    value.height = 1;
    try t.expectEqualDeep(insertion.Size{ .width = 1, .height = 1 }, try insertion.size(value));
    value.width = 0;
    try t.expectError(error.InvalidPictureInsertionSize, insertion.size(value));
    value.width = std.math.maxInt(u32);
    try t.expectError(error.InvalidPictureInsertionSize, insertion.size(value));
}

test "image insertion 공통 UTF16 경계·CR 보존·surrogate 내부 거부" {
    const text = "가😀나\r";
    try t.expectEqual(@as(usize, 0), try insertion.byteOffset(text, 0));
    try t.expectEqual(@as(usize, 3), try insertion.byteOffset(text, 1));
    try t.expectEqual(@as(usize, 7), try insertion.byteOffset(text, 3));
    try t.expectEqual(@as(usize, 10), try insertion.byteOffset(text, 4));
    try t.expectEqual(@as(usize, 11), try insertion.byteOffset(text, 5));
    try t.expectError(error.InvalidPictureInsertionPosition, insertion.byteOffset(text, 2));
    try t.expectError(error.InvalidPictureInsertionPosition, insertion.byteOffset(text, 6));
    try t.expectError(error.InvalidUnicodeEncoding, insertion.byteOffset(&.{0xff}, 0));
}

test "image insertion 공통 원문 전체 조건은 정규화하지 않음" {
    const value = request();
    try t.expectEqual(@as(usize, 0), try insertion.verifyText("가😀나\r", value));
    try t.expectError(error.PictureInsertionTextMismatch, insertion.verifyText("가😀나", value));
    try t.expectError(error.PictureInsertionTextMismatch, insertion.verifyText("가😀나\n", value));
}

test "image insertion 공통 원본 해시·이미지 형식과 크기 검증" {
    const a = t.allocator;
    const png = try @import("png/pixels_fixture.zig").image(a, 77);
    defer a.free(png);
    var value = request();
    std.crypto.hash.sha2.Sha256.hash("문서 바이트", &value.expected_source_sha256, .{});
    _ = try insertion.validateInput("문서 바이트", png, value);
    try t.expectError(error.SourceHashMismatch, insertion.validateInput("다른 문서", png, value));
    try t.expectError(error.UnsupportedReplacementImageFormat, insertion.validateInput("문서 바이트", "GIF89a", value));
}
