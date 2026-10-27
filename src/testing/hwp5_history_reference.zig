//! old455가 만든 고정 reference만 읽는 테스트 전용 adapter. 현재 편집 엔진을 호출하지 않는다.
const std = @import("std");
const builtin = @import("builtin");
const directory = "tests/fixtures/hwp5-history-reference-v1/";
const input_sha = "b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f";
const catalog_sha = "185695c2443c36d459ef04476c35e2315a47ea58880f8b0f30c9388cf8471bdf";
const old_commit = "ac196c0720a438871af26228051bcd3e738e15c6";
const old_closure = "5c5f50fda6ac137ef04e28c7f65f3b33882ba91b9b091bb61fa1ff2ee487505b";
pub const Request = struct { kind: enum { format, table, picture }, section: usize = 0, paragraph: usize = 15, node: u32 = 0, width: u32 = 0, height: u32 = 0 };
pub const Result = struct {
    allocator: std.mem.Allocator,
    states: [3][]u8,
    pub fn deinit(self: *Result) void {
        for (self.states) |bytes| self.allocator.free(bytes);
    }
};
pub const Refusal = enum { noop_external, changed_external, payload, failed_batch };
const Blob = struct { sha256: []const u8, bytes: usize };
const Target = struct {
    arch: []const u8,
    os: []const u8,
    abi: []const u8,
    pointerBits: u16,
    payloadCost: usize,
    initBelowCostError: ?[]const u8 = null,
};
const Case = struct {
    method: []const u8,
    kind: []const u8 = "",
    section: usize = 0,
    paragraph: usize = 15,
    node: u32 = 0,
    width: u32 = 0,
    height: u32 = 0,
    states: []const Blob = &.{},
    errorName: ?[]const u8 = null,
};
const Catalog = struct { schemaVersion: u32, oldCommit: []const u8, oldClosureSHA256: []const u8, inputSHA256: []const u8, targets: []const Target, cases: []const Case };
const Loaded = struct {
    parsed: std.json.Parsed(Catalog),
    fn deinit(self: *Loaded) void {
        self.parsed.deinit();
    }
    fn find(self: *const Loaded, method: []const u8, kind: []const u8, request: ?Request) !Case {
        var found: ?Case = null;
        for (self.parsed.value.cases) |row| {
            if (!std.mem.eql(u8, method, row.method) or !std.mem.eql(u8, kind, row.kind)) continue;
            if (request) |r| {
                if (r.section != row.section or r.paragraph != row.paragraph or r.node != row.node or r.width != row.width or r.height != row.height) continue;
            } else if (row.section != 0 or row.paragraph != 15 or row.node != 0 or row.width != 0 or row.height != 0) return error.ReferenceRequestMismatch;
            if (found != null) return error.ReferenceDuplicateKey;
            found = row;
        }
        return found orelse error.ReferenceRequestMismatch;
    }
    fn target(self: *const Loaded) !Target {
        var found: ?Target = null;
        for (self.parsed.value.targets) |row| {
            if (row.pointerBits != @bitSizeOf(usize) or !std.mem.eql(u8, row.arch, @tagName(builtin.cpu.arch)) or !std.mem.eql(u8, row.os, @tagName(builtin.os.tag)) or !std.mem.eql(u8, row.abi, @tagName(builtin.abi))) continue;
            if (found != null) return error.ReferenceDuplicateTarget;
            found = row;
        }
        return found orelse error.ReferenceTargetUnavailable;
    }
};
fn sha(bytes: []const u8) [64]u8 {
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &digest, .{});
    return std.fmt.bytesToHex(digest, .lower);
}
fn load(a: std.mem.Allocator, input: []const u8) !Loaded {
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, directory ++ "catalog.json", a, .limited(128 * 1024));
    defer a.free(bytes);
    if (!std.mem.eql(u8, catalog_sha, &sha(bytes))) return error.ReferenceCatalogMismatch;
    const parsed = try std.json.parseFromSlice(Catalog, a, bytes, .{ .allocate = .alloc_always });
    errdefer parsed.deinit();
    const c = parsed.value;
    if (c.schemaVersion != 1 or !std.mem.eql(u8, c.oldCommit, old_commit) or !std.mem.eql(u8, c.oldClosureSHA256, old_closure)) return error.ReferenceProvenanceMismatch;
    if (!std.mem.eql(u8, c.inputSHA256, input_sha) or !std.mem.eql(u8, input_sha, &sha(input))) return error.ReferenceInputMismatch;
    return .{ .parsed = parsed };
}
fn blob(a: std.mem.Allocator, value: Blob) ![]u8 {
    if (value.sha256.len != 64 or value.bytes > 4_000_000) return error.InvalidReferenceBlob;
    for (value.sha256) |c| if (!std.ascii.isDigit(c) and !(c >= 'a' and c <= 'f')) return error.InvalidReferenceBlob;
    const path = try std.fmt.allocPrint(a, directory ++ "{s}.hwp", .{value.sha256});
    defer a.free(path);
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
    errdefer a.free(bytes);
    if (bytes.len != value.bytes or !std.mem.eql(u8, value.sha256, &sha(bytes))) return error.ReferenceBlobMismatch;
    return bytes;
}
pub fn run(a: std.mem.Allocator, input: []const u8, request: Request) !Result {
    var c = try load(a, input);
    defer c.deinit();
    const row = try c.find("run", @tagName(request.kind), request);
    if (row.states.len != 3 or row.errorName != null) return error.InvalidReferenceResult;
    var result: Result = .{ .allocator = a, .states = undefined };
    var count: usize = 0;
    errdefer for (result.states[0..count]) |bytes| a.free(bytes);
    for (row.states, 0..) |value, i| {
        result.states[i] = try blob(a, value);
        count += 1;
    }
    return result;
}
pub fn current20(a: std.mem.Allocator, input: []const u8) ![]u8 {
    var c = try load(a, input);
    defer c.deinit();
    const row = try c.find("current20", "", null);
    if (row.states.len != 1 or row.errorName != null) return error.InvalidReferenceResult;
    return blob(a, row.states[0]);
}
pub fn payloadCost(a: std.mem.Allocator, input: []const u8) !usize {
    var c = try load(a, input);
    defer c.deinit();
    _ = try c.find("payloadCost", "", null);
    return (try c.target()).payloadCost;
}
pub fn refusal(a: std.mem.Allocator, input: []const u8, kind: Refusal, cap: ?u32) !?[]const u8 {
    var c = try load(a, input);
    defer c.deinit();
    const row = try c.find("refusal", @tagName(kind), null);
    if (kind == .payload) {
        if (cap == null) return error.ReferenceRequestMismatch;
        const target = try c.target();
        if (target.payloadCost > 0 and cap.? == target.payloadCost - 1) {
            // old helper는 초기화 거부를 오류 문자열로 변환하지 않고 전파한다.
            const name = target.initBelowCostError orelse return error.ReferenceRequestMismatch;
            if (std.mem.eql(u8, name, "LimitExceeded")) return error.LimitExceeded;
            return error.ReferenceUnsupportedError;
        }
        if (cap.? != target.payloadCost) return error.ReferenceRequestMismatch;
        if (row.states.len != 0) return error.InvalidReferenceResult;
        const name = row.errorName orelse return error.InvalidReferenceResult;
        // 반환 수명을 기존 정적 @errorName 계약과 같게 유지한다. 새 오류명은 명시 검토한다.
        if (std.mem.eql(u8, name, "LimitExceeded")) return "LimitExceeded";
        return error.ReferenceUnsupportedError;
    }
    if (cap != null or row.states.len != 1 or row.errorName != null) return error.ReferenceRequestMismatch;
    return try blob(a, row.states[0]);
}
