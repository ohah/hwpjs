//! Test-only raw input boundary. No product parser policy or expected outcomes.
const std = @import("std");
const config = @import("hwpx_package_corpus_config");

const Entry = struct {
    path: []const u8,
    origin: []const u8,
    originCommit: []const u8,
    sourcePath: []const u8,
    mode: []const u8,
    bytes: usize,
    gitBlobSHA1: []const u8,
    sha256: []const u8,
};
const Manifest = struct {
    schema: u32,
    cohort: []const u8,
    referenceCount: usize,
    ownCount: usize,
    entries: []const Entry,
};
const manifest_bytes = @embedFile("../testing/hwpx-package-historical-484.json");

fn safeRelative(path: []const u8) bool {
    if (path.len == 0 or std.fs.path.isAbsolute(path) or std.mem.indexOfScalar(u8, path, '\\') != null) return false;
    var parts = std.mem.splitScalar(u8, path, '/');
    while (parts.next()) |part| {
        if (part.len == 0 or std.mem.eql(u8, part, ".") or std.mem.eql(u8, part, "..")) return false;
    }
    return true;
}

pub const Dataset = struct {
    parsed: std.json.Parsed(Manifest),

    pub fn deinit(self: *Dataset) void {
        self.parsed.deinit();
        self.* = undefined;
    }

    pub fn entries(self: *const Dataset) []const Entry {
        return self.parsed.value.entries;
    }

    pub fn read(_: *const Dataset, a: std.mem.Allocator, entry: Entry) ![]u8 {
        const path = try std.fs.path.join(a, &.{ config.root, entry.path });
        defer a.free(path);
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(25_000_000));
        errdefer a.free(bytes);
        if (bytes.len != entry.bytes) return error.PackageCorpusSizeMismatch;
        var digest: [32]u8 = undefined;
        std.crypto.hash.sha2.Sha256.hash(bytes, &digest, .{});
        if (!std.mem.eql(u8, &std.fmt.bytesToHex(digest, .lower), entry.sha256)) return error.PackageCorpusHashMismatch;
        return bytes;
    }
};

pub fn open(a: std.mem.Allocator) !Dataset {
    // Missing dataset is an error in the required full test graph, never a skip.
    if (config.root.len == 0 or !std.fs.path.isAbsolute(config.root)) return error.PackageCorpusRootRequired;
    const parsed = try std.json.parseFromSlice(Manifest, a, manifest_bytes, .{ .allocate = .alloc_always });
    errdefer parsed.deinit();
    const value = parsed.value;
    if (value.schema != 1 or !std.mem.eql(u8, value.cohort, "historical-e880-72b7-484") or value.referenceCount != 439 or value.ownCount != 45 or value.entries.len != 484) return error.InvalidPackageCorpusManifest;
    var expected: std.StringHashMapUnmanaged(void) = .empty;
    defer expected.deinit(a);
    var reference_count: usize = 0;
    var own_count: usize = 0;
    for (value.entries) |entry| {
        if (!safeRelative(entry.path) or !safeRelative(entry.sourcePath) or entry.bytes > 25_000_000 or entry.sha256.len != 64 or entry.gitBlobSHA1.len != 40) return error.InvalidPackageCorpusManifest;
        if (!std.mem.eql(u8, entry.mode, "100644") and !std.mem.eql(u8, entry.mode, "100755")) return error.InvalidPackageCorpusManifest;
        const reference = std.mem.eql(u8, entry.origin, "reference");
        const own = std.mem.eql(u8, entry.origin, "own");
        if (!reference and !own) return error.InvalidPackageCorpusManifest;
        const prefix = if (reference) "reference/" else "own/";
        const origin_commit = if (reference) "e8800c8def63449808a4092798442652ed460552" else "72b7da38b7450d30ab39201df07e1f3b01f06238";
        const source_prefix = if (reference) "samples/" else "legacy/rust/crates/hwp-core/tests/fixtures/";
        if (!std.mem.eql(u8, entry.originCommit, origin_commit) or !std.mem.startsWith(u8, entry.sourcePath, source_prefix) or !std.mem.endsWith(u8, entry.sourcePath, ".hwpx") or !std.mem.startsWith(u8, entry.path, prefix) or !std.mem.eql(u8, entry.path[prefix.len..], entry.sourcePath)) return error.InvalidPackageCorpusManifest;
        const slot = try expected.getOrPut(a, entry.path);
        if (slot.found_existing) return error.DuplicatePackageCorpusPath;
        if (reference) reference_count += 1 else own_count += 1;
    }
    if (reference_count != 439 or own_count != 45) return error.InvalidPackageCorpusManifest;
    const dir = try std.Io.Dir.cwd().openDir(std.testing.io, config.root, .{ .iterate = true });
    defer dir.close(std.testing.io);
    var walker = try dir.walk(a);
    defer walker.deinit();
    var found: usize = 0;
    while (try walker.next(std.testing.io)) |entry| {
        if (entry.kind == .directory) continue;
        if (entry.kind != .file or !expected.contains(entry.path)) return error.UnexpectedPackageCorpusEntry;
        found += 1;
    }
    if (found != value.entries.len) return error.MissingPackageCorpusEntry;
    return .{ .parsed = parsed };
}
