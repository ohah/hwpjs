//! 독립 표 삭제 파일 변환의 출력 소유권과 ABI 입력 한계를 담당한다.
const std = @import("std");
pub const max_document_bytes: usize = 64 * 1024 * 1024;
pub const max_targets: usize = @import("../model/cell_edit_budget.zig").max_cells;

pub const Request = struct {
    format: u32,
    input_ptr: [*]const u8,
    input_len: usize,
    section: u32,
    targets_ptr: [*]const u32,
    targets_len: usize,
};

pub fn validateRequest(format: u32, input_len: usize, targets_len: usize) !void {
    if (format != 1 and format != 2) return error.InvalidDocumentFormat;
    if (input_len == 0 or input_len > max_document_bytes) return error.LimitExceeded;
    if (targets_len == 0 or targets_len > max_targets) return error.InvalidTableDeletionTargets;
}

/// 슬라이스를 만들기 전에 정수 주소의 곱셈·덧셈 범위를 확인한다.
/// 실제 WASM 메모리 접근 권한은 호출자가 제공한 메모리 계약을 따른다.
pub fn validateAddress(address: usize, count: usize, element_size: usize, alignment: usize) !void {
    if (address == 0 or alignment == 0 or address % alignment != 0) return error.InvalidTableDeletionPointer;
    const bytes = std.math.mul(usize, count, element_size) catch return error.LimitExceeded;
    _ = std.math.add(usize, address, bytes) catch return error.LimitExceeded;
}

pub const Output = struct {
    allocator: std.mem.Allocator,
    bytes: ?[]u8 = null,

    pub fn clear(self: *Output) void {
        if (self.bytes) |bytes| self.allocator.free(bytes);
        self.bytes = null;
    }

    pub fn ptr(self: *const Output) usize {
        return if (self.bytes) |bytes| @intFromPtr(bytes.ptr) else 0;
    }

    pub fn len(self: *const Output) usize {
        return if (self.bytes) |bytes| bytes.len else 0;
    }

    pub fn replace(self: *Output, request: Request) !void {
        return self.replaceWith(request, transform);
    }

    /// 출력은 즉시 숨기되 입력·대상 포인터가 이전 출력을 가리킬 수 있어
    /// 이전 할당은 검증과 변환을 모두 마칠 때까지 유지한다.
    /// 변환 공급자는 입력을 빌리며 성공 결과의 새 소유 버퍼를 반환해야 한다.
    pub fn replaceWith(self: *Output, request: Request, comptime convert: anytype) !void {
        const previous = self.bytes;
        self.bytes = null;
        defer if (previous) |bytes| self.allocator.free(bytes);
        try validateRequest(request.format, request.input_len, request.targets_len);
        try validateAddress(@intFromPtr(request.input_ptr), request.input_len, 1, 1);
        try validateAddress(@intFromPtr(request.targets_ptr), request.targets_len, @sizeOf(u32), @alignOf(u32));
        const targets = try self.allocator.alloc(usize, request.targets_len);
        defer self.allocator.free(targets);
        for (request.targets_ptr[0..request.targets_len], targets) |node, *target| {
            target.* = std.math.cast(usize, node) orelse return error.InvalidTableDeletionTarget;
        }
        const candidate = try convert(self.allocator, request.format, request.input_ptr[0..request.input_len], request.section, targets);
        errdefer self.allocator.free(candidate);
        if (candidate.len == 0 or candidate.len > max_document_bytes) return error.LimitExceeded;
        self.bytes = candidate;
    }
};

fn transform(a: std.mem.Allocator, format: u32, input: []const u8, section: u32, targets: []const usize) ![]u8 {
    return switch (format) {
        1 => @import("../hwp5/edit/table_deletion_file.zig").transform(a, input, section, targets, .{ .max_input_bytes = max_document_bytes, .max_output_bytes = max_document_bytes }),
        2 => @import("../hwpx/table_deletion_file.zig").transform(a, input, section, targets, .{ .max_input_bytes = max_document_bytes, .max_output_bytes = max_document_bytes }),
        else => error.InvalidDocumentFormat,
    };
}
