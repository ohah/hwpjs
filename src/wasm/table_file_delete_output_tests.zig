const std = @import("std");
const owner = @import("table_file_delete_output.zig");
const a = std.testing.allocator;
const input = "문서 원본";
const nodes = [_]u32{ 20, 59 };

fn request() owner.Request {
    return .{ .format = 1, .input_ptr = input.ptr, .input_len = input.len, .section = 3, .targets_ptr = &nodes, .targets_len = nodes.len };
}

fn copy(allocator: std.mem.Allocator, format: u32, bytes: []const u8, section: u32, targets: []const usize) ![]u8 {
    try std.testing.expect(format == 1 or format == 2);
    try std.testing.expectEqual(@as(u32, 3), section);
    try std.testing.expectEqualSlices(usize, &.{ 20, 59 }, targets);
    return allocator.dupe(u8, bytes);
}

fn unexpected(_: std.mem.Allocator, _: u32, _: []const u8, _: u32, _: []const usize) ![]u8 {
    return error.UnexpectedTransformCall;
}

fn expectCleared(output: *const owner.Output) !void {
    try std.testing.expectEqual(@as(usize, 0), output.ptr());
    try std.testing.expectEqual(@as(usize, 0), output.len());
}

test "표 파일 삭제 ABI 출력 게시와 반복 해제" {
    var output: owner.Output = .{ .allocator = a };
    defer output.clear();
    try expectCleared(&output);
    try output.replaceWith(request(), copy);
    try std.testing.expectEqualSlices(u8, input, output.bytes.?);
    try std.testing.expect(output.ptr() != @intFromPtr(input.ptr));
    output.clear();
    output.clear();
    try expectCleared(&output);
}

test "표 파일 삭제 ABI 두 형식의 동일 출력 소유권" {
    for ([_]u32{ 1, 2 }) |format| {
        var output: owner.Output = .{ .allocator = a };
        defer output.clear();
        var value = request();
        value.format = format;
        try output.replaceWith(value, copy);
        try std.testing.expectEqualSlices(u8, input, output.bytes.?);
    }
}

test "표 파일 삭제 ABI 잘못된 형식은 변환 전에 출력 비움" {
    var output: owner.Output = .{ .allocator = a };
    defer output.clear();
    for ([_]u32{ 0, 3, std.math.maxInt(u32) }) |format| {
        output.bytes = try a.dupe(u8, input);
        var value = request();
        value.format = format;
        try std.testing.expectError(error.InvalidDocumentFormat, output.replaceWith(value, unexpected));
        try expectCleared(&output);
    }
}

test "표 파일 삭제 ABI 입력 영 바이트와 실제 64MiB 초과 거부" {
    var output: owner.Output = .{ .allocator = a };
    defer output.clear();
    for ([_]usize{ 0, owner.max_document_bytes + 1, std.math.maxInt(usize) }) |size| {
        output.bytes = try a.dupe(u8, input);
        var value = request();
        value.input_len = size;
        try std.testing.expectError(error.LimitExceeded, output.replaceWith(value, unexpected));
        try expectCleared(&output);
    }
    try owner.validateRequest(1, owner.max_document_bytes, 1);
}

test "표 파일 삭제 ABI 대상 영 개와 실제 4096 경계" {
    var output: owner.Output = .{ .allocator = a };
    defer output.clear();
    for ([_]usize{ 0, 4097, std.math.maxInt(usize) }) |count| {
        output.bytes = try a.dupe(u8, input);
        var value = request();
        value.targets_len = count;
        try std.testing.expectError(error.InvalidTableDeletionTargets, output.replaceWith(value, unexpected));
        try expectCleared(&output);
    }
    const targets = try a.alloc(u32, 4096);
    defer a.free(targets);
    for (targets, 0..) |*target, i| target.* = @intCast(i);
    var value = request();
    value.targets_ptr = targets.ptr;
    value.targets_len = targets.len;
    try output.replaceWith(value, struct {
        fn run(allocator: std.mem.Allocator, _: u32, bytes: []const u8, _: u32, selected: []const usize) ![]u8 {
            try std.testing.expectEqual(@as(usize, 4096), selected.len);
            for (selected, 0..) |node, i| try std.testing.expectEqual(i, node);
            return allocator.dupe(u8, bytes);
        }
    }.run);
}

test "표 파일 삭제 ABI 주소 영 값 정렬 곱셈과 덧셈 초과" {
    try std.testing.expectError(error.InvalidTableDeletionPointer, owner.validateAddress(0, 1, 1, 1));
    try std.testing.expectError(error.InvalidTableDeletionPointer, owner.validateAddress(5, 1, 4, 4));
    try std.testing.expectError(error.LimitExceeded, owner.validateAddress(4, std.math.maxInt(usize), 4, 4));
    try std.testing.expectError(error.LimitExceeded, owner.validateAddress(std.math.maxInt(usize) - 3, 1, 4, 4));
    var output: owner.Output = .{ .allocator = a };
    defer output.clear();
    output.bytes = try a.dupe(u8, input);
    var value = request();
    value.input_ptr = @ptrFromInt(std.math.maxInt(usize) - 1);
    try std.testing.expectError(error.LimitExceeded, output.replaceWith(value, unexpected));
    try expectCleared(&output);
    output.bytes = try a.dupe(u8, input);
    value = request();
    value.targets_ptr = @ptrFromInt(std.math.maxInt(usize) - 3);
    value.targets_len = 1;
    try std.testing.expectError(error.LimitExceeded, output.replaceWith(value, unexpected));
    try expectCleared(&output);
}

test "표 파일 삭제 ABI 대상 u32 최댓값은 축소 없이 Native 거부로 전달" {
    var output: owner.Output = .{ .allocator = a };
    defer output.clear();
    const target = [_]u32{std.math.maxInt(u32)};
    var value = request();
    value.targets_ptr = &target;
    value.targets_len = 1;
    try std.testing.expectError(error.InvalidTableDeletionTarget, output.replaceWith(value, struct {
        fn run(_: std.mem.Allocator, _: u32, _: []const u8, _: u32, selected: []const usize) ![]u8 {
            try std.testing.expectEqual(@as(usize, std.math.maxInt(u32)), selected[0]);
            return error.InvalidTableDeletionTarget;
        }
    }.run));
    try expectCleared(&output);
}

test "표 파일 삭제 ABI 이전 출력 문서 별칭은 변환 종료까지 유효" {
    const Observer = struct {
        var current: ?*owner.Output = null;
        fn run(allocator: std.mem.Allocator, format: u32, bytes: []const u8, section: u32, targets: []const usize) ![]u8 {
            try expectCleared(current.?);
            try std.testing.expectEqualSlices(u8, input, bytes);
            return copy(allocator, format, bytes, section, targets);
        }
    };
    var output: owner.Output = .{ .allocator = a };
    defer output.clear();
    Observer.current = &output;
    defer Observer.current = null;
    output.bytes = try a.dupe(u8, input);
    var value = request();
    value.input_ptr = output.bytes.?.ptr;
    value.input_len = output.bytes.?.len;
    try output.replaceWith(value, Observer.run);
    try std.testing.expectEqualSlices(u8, input, output.bytes.?);
}

test "표 파일 삭제 ABI 이전 출력 대상 배열 별칭도 유지" {
    var output: owner.Output = .{ .allocator = a };
    defer output.clear();
    const previous = try a.alloc(u8, 12);
    output.bytes = previous;
    const start = std.mem.alignForward(usize, @intFromPtr(previous.ptr), @alignOf(u32)) - @intFromPtr(previous.ptr);
    std.mem.writeInt(u32, previous[start..][0..4], 20, .little);
    std.mem.writeInt(u32, previous[start + 4 ..][0..4], 59, .little);
    var value = request();
    value.targets_ptr = @ptrCast(@alignCast(previous[start..].ptr));
    try output.replaceWith(value, copy);
    try std.testing.expectEqualSlices(u8, input, output.bytes.?);
}

test "표 파일 삭제 ABI 변환 실패 시 이전 출력 별칭과 입력 불변" {
    var output: owner.Output = .{ .allocator = a };
    defer output.clear();
    output.bytes = try a.dupe(u8, input);
    var value = request();
    value.input_ptr = output.bytes.?.ptr;
    value.input_len = output.bytes.?.len;
    try std.testing.expectError(error.UnsupportedTableDeletionContext, output.replaceWith(value, struct {
        fn run(_: std.mem.Allocator, _: u32, bytes: []const u8, _: u32, selected: []const usize) ![]u8 {
            try std.testing.expectEqualSlices(u8, input, bytes);
            try std.testing.expectEqualSlices(usize, &.{ 20, 59 }, selected);
            return error.UnsupportedTableDeletionContext;
        }
    }.run));
    try expectCleared(&output);
}

test "표 파일 삭제 ABI 빈 출력과 실제 64MiB 초과 결과 해제" {
    var output: owner.Output = .{ .allocator = a };
    defer output.clear();
    try std.testing.expectError(error.LimitExceeded, output.replaceWith(request(), struct {
        fn run(allocator: std.mem.Allocator, _: u32, _: []const u8, _: u32, _: []const usize) ![]u8 {
            return allocator.alloc(u8, 0);
        }
    }.run));
    try expectCleared(&output);
    try std.testing.expectError(error.LimitExceeded, output.replaceWith(request(), struct {
        fn run(allocator: std.mem.Allocator, _: u32, _: []const u8, _: u32, _: []const usize) ![]u8 {
            return allocator.alloc(u8, owner.max_document_bytes + 1);
        }
    }.run));
    try expectCleared(&output);
}

test "표 파일 삭제 ABI 모든 할당 실패와 이전 출력 해제" {
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            var output: owner.Output = .{ .allocator = allocator };
            defer output.clear();
            output.bytes = try allocator.dupe(u8, input);
            var value = request();
            value.input_ptr = output.bytes.?.ptr;
            value.input_len = output.bytes.?.len;
            try output.replaceWith(value, copy);
            try std.testing.expectEqualSlices(u8, input, output.bytes.?);
        }
    }.run, .{});
}

test "표 파일 삭제 ABI 두 실제 변환기의 손상 입력은 출력 게시 거부" {
    var output: owner.Output = .{ .allocator = a };
    defer output.clear();
    for ([_]u32{ 1, 2 }) |format| {
        output.bytes = try a.dupe(u8, input);
        var value = request();
        value.format = format;
        if (output.replace(value)) |_| {
            return error.TestUnexpectedResult;
        } else |err| {
            if (err == error.OutOfMemory) return err;
        }
        try expectCleared(&output);
    }
}
