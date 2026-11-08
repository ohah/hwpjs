const std = @import("std");
const t = std.testing;
const a = t.allocator;
const insertion = @import("image/image_insertion.zig");
const wire = @import("wasm/image_file_insert_request.zig");
const Output = @import("wasm/image_file_insert_output.zig").Output;

fn put(bytes: []u8, at: usize, value: u32) void {
    std.mem.writeInt(u32, bytes[at..][0..4], value, .little);
}
fn encode(request: insertion.Request) ![]u8 {
    const bytes = try a.alloc(u8, 64 + request.expected_text.len);
    @memset(bytes, 0);
    put(bytes, 0, 1);
    put(bytes, 4, request.target.section);
    put(bytes, 8, request.target.paragraph);
    put(bytes, 12, request.target.unit);
    put(bytes, 16, request.width);
    put(bytes, 20, request.height);
    put(bytes, 24, @intCast(request.expected_text.len));
    @memcpy(bytes[32..64], &request.expected_source_sha256);
    @memcpy(bytes[64..], request.expected_text);
    return bytes;
}
fn basic() insertion.Request {
    return .{ .expected_source_sha256 = @splat(0xa5), .target = .{ .section = 1, .paragraph = 19, .unit = 1 }, .expected_text = "가😀\r", .width = 59528, .height = 10000 };
}

test "image insertion ABI 요청 고정 오프셋·HWPUNIT·SHA·UTF8 원문" {
    const request = basic();
    const bytes = try encode(request);
    defer a.free(bytes);
    try t.expectEqualSlices(u8, &.{ 1, 0, 0, 0, 1, 0, 0, 0, 19, 0, 0, 0, 1, 0, 0, 0, 0x88, 0xe8, 0, 0, 0x10, 0x27, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0 }, bytes[0..32]);
    const decoded = try wire.decode(bytes);
    try t.expectEqualDeep(request.target, decoded.target);
    try t.expectEqualDeep(request.expected_source_sha256, decoded.expected_source_sha256);
    try t.expectEqualStrings(request.expected_text, decoded.expected_text);
    try t.expectEqual(request.width, decoded.width);
    try t.expectEqual(request.height, decoded.height);
}

test "image insertion ABI 잘못된 길이·버전·reserved·기하·surrogate 거부" {
    const bytes = try encode(basic());
    defer a.free(bytes);
    for (0..64) |length| try t.expectError(error.InvalidImageInsertionRequestLength, wire.decode(bytes[0..length]));
    put(bytes, 24, 7);
    try t.expectError(error.InvalidImageInsertionRequestLength, wire.decode(bytes));
    put(bytes, 24, 8);
    put(bytes, 0, 2);
    try t.expectError(error.InvalidImageInsertionRequest, wire.decode(bytes));
    put(bytes, 0, 1);
    put(bytes, 28, 1);
    try t.expectError(error.InvalidImageInsertionRequest, wire.decode(bytes));
    put(bytes, 28, 0);
    put(bytes, 16, 0);
    try t.expectError(error.InvalidPictureInsertionSize, wire.decode(bytes));
    put(bytes, 16, 0x80000000);
    try t.expectError(error.InvalidPictureInsertionSize, wire.decode(bytes));
    put(bytes, 16, 59528);
    put(bytes, 12, 2);
    try t.expectError(error.InvalidPictureInsertionPosition, wire.decode(bytes));
    put(bytes, 12, 0);
    bytes[64] = 0xff;
    try t.expectError(error.InvalidUnicodeEncoding, wire.decode(bytes));
}

test "image insertion ABI 슬라이스 전 크기 경계와 형식 거부" {
    const validate = @import("wasm/image_file_insert_output.zig").validateSizes;
    try validate(1, 64 * 1024 * 1024, wire.max_bytes, 8 * 1024 * 1024);
    try validate(2, 1, 64, 1);
    try t.expectError(error.InvalidDocumentFormat, validate(3, 1, 64, 1));
    try t.expectError(error.LimitExceeded, validate(1, 0, 64, 1));
    try t.expectError(error.LimitExceeded, validate(1, 64 * 1024 * 1024 + 1, 64, 1));
    try t.expectError(error.LimitExceeded, validate(2, 1, 64, 8 * 1024 * 1024 + 1));
    try t.expectError(error.InvalidImageInsertionRequestLength, validate(2, 1, 63, 1));
    try t.expectError(error.InvalidImageInsertionRequestLength, validate(2, 1, wire.max_bytes + 1, 1));
}

fn original(format: u32) ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(t.io, if (format == 1) "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwp" else "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwpx", a, .limited(insertion.picture_input.max_document_bytes));
}
fn requestFor(format: u32, input: []const u8) !insertion.Request {
    var request: insertion.Request = .{ .expected_source_sha256 = undefined, .target = .{ .section = 0, .paragraph = if (format == 1) 18 else 19, .unit = 0 }, .expected_text = "", .width = 7200, .height = 3600 };
    std.crypto.hash.sha2.Sha256.hash(input, &request.expected_source_sha256, .{});
    if (format == 1) {
        var document = try @import("hwp5/model_projection.zig").fromFile(a, input);
        defer document.deinit(a);
        const raw = try @import("hwp5/edit/plain_text_content.zig").textBytes(a, document.sections[0].paragraphs[18]);
        defer a.free(raw);
        request.expected_text = try insertion.utf8FromUtf16(a, raw);
    } else {
        var document = try @import("hwpx/package.zig").inspectDocument(a, input, .{});
        defer document.deinit(a);
        var tree = try document.readSectionTree(a, 0, .{});
        defer tree.deinit(a);
        var counters: @import("hwpx/section_text.zig").Report = .{};
        const paragraph = (try @import("hwpx/image_insertion_section.zig").locate(a, &tree, request, &counters)).?;
        var sites = try @import("hwpx/text_sites.zig").collect(a, &tree, .{});
        defer sites.deinit(a);
        var text: std.ArrayList(u8) = .empty;
        errdefer text.deinit(a);
        for (sites.items) |site| {
            const parent = tree.elements[site.element_index].parent orelse continue;
            if (tree.elements[parent].parent == paragraph) try text.appendSlice(a, site.text);
        }
        request.expected_text = try text.toOwnedSlice(a);
    }
    return request;
}

fn recovery(format: u32) !void {
    const input = try original(format);
    defer a.free(input);
    const request = try requestFor(format, input);
    defer a.free(request.expected_text);
    const bytes = try encode(request);
    defer a.free(bytes);
    const image = try @import("image/png/pixels_fixture.zig").image(a, 77);
    defer a.free(image);
    var output: Output = .{ .allocator = a };
    defer output.clear();
    try output.replace(format, input, bytes, image);
    try t.expect(output.bytes != null);
    const alias = output.bytes.?;
    const alias_request = try requestFor(format, alias);
    defer a.free(alias_request.expected_text);
    const alias_bytes = try encode(alias_request);
    defer a.free(alias_bytes);
    // 같은 문단에는 이제 그림이 있으므로 첫 범위의 명시 거부가 나와야 합니다.
    // 해시 검사·파싱까지 이전 출력이 살아 있어야 이 오류에 도달합니다.
    try t.expectError(error.UnsupportedPictureInsertionControl, output.replace(format, alias, alias_bytes, image));
    try t.expect(output.bytes == null);
    try output.replace(format, input, bytes, image);
    bytes[28] = 1;
    try t.expectError(error.InvalidImageInsertionRequest, output.replace(format, input, bytes, image));
    try t.expect(output.bytes == null);
    bytes[28] = 0;
    try output.replace(format, input, bytes, image);
    output.clear();
    output.clear();
}

test "image insertion ABI H5 이전 출력 alias 수명·실패 비움·복구" {
    try recovery(1);
}
test "image insertion ABI HX 이전 출력 alias 수명·실패 비움·복구" {
    try recovery(2);
}

test "image insertion ABI 서로 다른 출력 소유자와 초기 OOM" {
    var first: Output = .{ .allocator = a };
    defer first.clear();
    var second: Output = .{ .allocator = a };
    defer second.clear();
    first.bytes = try a.dupe(u8, "출력 하나");
    second.bytes = try a.dupe(u8, "출력 둘");
    first.clear();
    try t.expectEqualStrings("출력 둘", second.bytes.?);
    const input = try original(1);
    defer a.free(input);
    const request = try requestFor(1, input);
    defer a.free(request.expected_text);
    const bytes = try encode(request);
    defer a.free(bytes);
    const image = try @import("image/png/pixels_fixture.zig").image(a, 77);
    defer a.free(image);
    var failing = t.FailingAllocator.init(a, .{ .fail_index = 0 });
    var output: Output = .{ .allocator = failing.allocator() };
    defer output.clear();
    try t.expectError(error.OutOfMemory, output.replace(1, input, bytes, image));
    try t.expect(output.bytes == null);
}
