const std = @import("std");
const zip = @import("../zip/archive.zig");
const manifest = @import("content_manifest.zig");
const ole = @import("../ole/container.zig");
const cfb = @import("../cfb/reader.zig");
const magic = @import("../cfb/format.zig").signature;

pub const Options = struct {
    max_targets: usize = 100_000,
    max_entry_bytes: usize = 64 * 1024 * 1024,
    max_total_encoded_bytes: usize = 512 * 1024 * 1024,
    max_total_inner_stream_bytes: usize = 512 * 1024 * 1024,
    max_total_entries: usize = 1_000_000,
    max_total_path_bytes: usize = 64 * 1024 * 1024,
    cfb: cfb.Options = .{},
};

pub const Target = struct {
    item_index: usize,
    entry_index: usize,
    declared_external: bool,
    encoded_bytes: usize,
    layout: ?ole.envelope.Layout,
    inspection_error: ?anyerror,
    entries: usize,
    streams: usize,
    stream_bytes: usize,
    path_bytes: usize,
};

pub const Report = struct {
    candidates: usize = 0,
    declared_external: usize = 0,
    packaged_copies: usize = 0,
    external_packaged_copies: usize = 0,
    without_packaged_copy: usize = 0,
    targets: []Target,
    inspection_failures: usize = 0,
    encoded_bytes: usize = 0,
    entries: usize = 0,
    streams: usize = 0,
    stream_bytes: usize = 0,
    path_bytes: usize = 0,

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        a.free(self.targets);
        self.* = undefined;
    }
};

pub fn isCandidate(item: manifest.Item) bool {
    const media = std.mem.trim(u8, std.mem.sliceTo(item.media_type, ';'), " \t");
    if (std.ascii.eqlIgnoreCase(media, "application/ole")) return true;
    return item.href.len >= 4 and std.ascii.eqlIgnoreCase(item.href[item.href.len - 4 ..], ".ole");
}

fn isInternalPath(path: []const u8) bool {
    return path.len > 8 and std.ascii.eqlIgnoreCase(path[0..8], "BinData/") and zip.validPath(path);
}

fn entryIndex(archive: zip.Archive, name: []const u8) ?usize {
    for (archive.entries, 0..) |entry, index| {
        if (std.mem.eql(u8, entry.name, name)) return index;
    }
    return null;
}

fn layoutOf(bytes: []const u8) ?ole.envelope.Layout {
    if (std.mem.startsWith(u8, bytes, &magic)) return .raw_cfb;
    if (bytes.len >= 12 and std.mem.eql(u8, bytes[4..12], &magic)) return .observed_size_prefix;
    return null;
}

/// The OPF external declaration is preserved even if an exact BinData ZIP
/// copy exists. No URL or filesystem path is fetched.
pub fn inspect(a: std.mem.Allocator, archive: zip.Archive, items: manifest.Manifest, options: Options) !Report {
    var targets: std.ArrayList(Target) = .empty;
    errdefer targets.deinit(a);
    var report: Report = .{ .targets = undefined };
    for (items.items, 0..) |item, item_index| {
        if (!isCandidate(item)) continue;
        report.candidates += 1;
        const external = item.embedded == false;
        report.declared_external += @intFromBool(external);
        const selected_index: usize = if (external) blk: {
            if (!isInternalPath(item.href)) {
                report.without_packaged_copy += 1;
                continue;
            }
            break :blk entryIndex(archive, item.href) orelse {
                report.without_packaged_copy += 1;
                continue;
            };
        } else if (item.entry_index) |index| blk: {
            if (index >= archive.entries.len or !std.mem.eql(u8, archive.entries[index].name, item.href)) return error.InvalidManifestEntryIndex;
            break :blk index;
        } else return error.InvalidManifestEntryIndex;
        if (targets.items.len == options.max_targets) return error.LimitExceeded;
        const entry = archive.entries[selected_index];
        if (entry.uncompressed_size > options.max_entry_bytes or entry.uncompressed_size > options.max_total_encoded_bytes -| report.encoded_bytes) return error.LimitExceeded;
        const bytes = try archive.decode(entry, options.max_entry_bytes);
        defer archive.allocator.free(bytes);
        const layout = layoutOf(bytes);
        var target: Target = .{ .item_index = item_index, .entry_index = selected_index, .declared_external = external, .encoded_bytes = bytes.len, .layout = layout, .inspection_error = null, .entries = 0, .streams = 0, .stream_bytes = 0, .path_bytes = 0 };
        if (layout) |selected| {
            var limits = options.cfb;
            limits.max_input_bytes = @min(limits.max_input_bytes, options.max_entry_bytes);
            limits.max_total_stream_bytes = @min(limits.max_total_stream_bytes, options.max_total_inner_stream_bytes -| report.stream_bytes);
            limits.max_entries = @min(limits.max_entries, options.max_total_entries -| report.entries);
            limits.max_path_bytes = @min(limits.max_path_bytes, options.max_total_path_bytes -| report.path_bytes);
            if (ole.open(a, bytes, selected, limits)) |file_value| {
                var file = file_value;
                defer file.deinit();
                target.entries = file.entries.len;
                for (file.entries) |member| {
                    target.path_bytes = std.math.add(usize, target.path_bytes, member.path.len) catch return error.LimitExceeded;
                    if (member.kind == 2) {
                        target.streams = std.math.add(usize, target.streams, 1) catch return error.LimitExceeded;
                        target.stream_bytes = std.math.add(usize, target.stream_bytes, member.content.len) catch return error.LimitExceeded;
                    }
                }
                if (target.path_bytes > limits.max_path_bytes or target.stream_bytes > limits.max_total_stream_bytes) return error.LimitExceeded;
            } else |err| switch (err) {
                error.OutOfMemory, error.LimitExceeded => return err,
                else => target.inspection_error = err,
            }
        } else target.inspection_error = error.UnsupportedOleEnvelope;
        try targets.append(a, target);
        report.packaged_copies += 1;
        report.external_packaged_copies += @intFromBool(external);
        report.inspection_failures += @intFromBool(target.inspection_error != null);
        report.encoded_bytes += bytes.len;
        report.entries += target.entries;
        report.streams += target.streams;
        report.stream_bytes += target.stream_bytes;
        report.path_bytes += target.path_bytes;
    }
    report.targets = try targets.toOwnedSlice(a);
    return report;
}
