const markers = @import("markers.zig");
const entropy = @import("entropy.zig");
const frame_parser = @import("frame.zig");
const scan_parser = @import("scan.zig");
const fields = @import("scan_fields.zig");
const restarts = @import("restarts.zig");

pub const Options = struct {
    markers: markers.Options = .{},
    frame: frame_parser.Options = .{},
    max_scans: usize = 65536,
    max_restarts: usize = 65536,
    allow_trailing_bytes: bool = false,
};
pub const Report = struct {
    markers: usize = 0,
    scans: usize = 0,
    restart_markers: usize = 0,
    entropy_bytes: usize = 0,
    stuffed_bytes: usize = 0,
    width: u16 = 0,
    header_height: u16 = 0,
    effective_height: u16 = 0,
    dnl_seen: bool = false,
    restart_interval: u16 = 0,
    trailing_bytes: usize = 0,
    miscellaneous_markers: usize = 0,
    /// Includes MCU distances/rows, entropy completion, and table meanings.
    semantics_deferred: bool = true,
};

pub fn isFrame(code: u8) bool {
    return code >= 0xc0 and code <= 0xcf and code != 0xc4 and code != 0xc8 and code != 0xcc;
}

/// One non-hierarchical image's byte/marker structure, not a JPEG decoder.
/// Table contents/selection/progression are separate inspectors, not reimplemented.
pub fn inspect(bytes: []const u8, options: Options) !Report {
    return inspectWithMarkerCheck(bytes, options, ignoreMarker);
}

fn ignoreMarker(_: markers.Marker) !void {}

/// Additional format constraints use the same complete marker/entropy walk.
/// The check observes each parsed marker, including SOI/EOI, but not entropy
/// bytes. Checks should be side-effect free; failure can occur later in input.
pub fn inspectWithMarkerCheck(bytes: []const u8, options: Options, comptime check: fn (markers.Marker) anyerror!void) !Report {
    var it = try markers.Iterator.init(bytes, options.markers);
    const first = (try it.next()) orelse return error.MissingJpegSoi;
    if (first.code != 0xd8) return error.MissingJpegSoi;
    try check(first);
    var frame: ?frame_parser.Frame = null;
    var restart: restarts.State = .{};
    var report: Report = .{};
    while (true) {
        if (restart.in_scan) {
            const segment = try entropy.takeUntilMarker(&it.reader, options.markers.max_bytes);
            report.entropy_bytes += segment.raw.len;
            report.stuffed_bytes += segment.stuffed_bytes;
        }
        const marker = (try it.next()) orelse return error.MissingJpegEoi;
        try check(marker);
        if (marker.code >= 0xd0 and marker.code <= 0xd7) {
            try restart.accept(marker.code, options.max_restarts);
            continue;
        }
        const ended_scan = restart.in_scan;
        if (ended_scan) {
            if (report.scans == 1 and report.header_height == 0 and marker.code != 0xdc) return error.MissingJpegDnl;
            restart.endScan();
        }
        if (isFrame(marker.code)) {
            if (frame != null) return error.DuplicateJpegFrame;
            frame = try frame_parser.parse(marker.code, marker.payload, options.frame);
            report.width = frame.?.width;
            report.header_height = frame.?.height;
            report.effective_height = frame.?.height;
        } else switch (marker.code) {
            0xd8 => return error.DuplicateJpegSoi,
            0xda => {
                const f = frame orelse return error.MissingJpegFrame;
                if (report.scans >= options.max_scans) return error.LimitExceeded;
                _ = try scan_parser.parse(marker.payload, f);
                report.scans += 1;
                restart.beginScan();
            },
            0xdc => {
                if (!ended_scan or report.scans != 1 or report.dnl_seen) return error.InvalidJpegDnlPosition;
                const height = try fields.numberOfLines(marker.payload);
                if (@as(u64, report.width) * height > options.frame.max_pixels) return error.LimitExceeded;
                report.effective_height = height;
                report.dnl_seen = true;
            },
            0xdd => try restart.define(marker.payload),
            0xd9 => {
                if (frame == null) return error.MissingJpegFrame;
                if (report.scans == 0) return error.MissingJpegScan;
                if (report.effective_height == 0) return error.MissingJpegDnl;
                report.trailing_bytes = bytes.len - it.reader.offset;
                if (!options.allow_trailing_bytes and report.trailing_bytes != 0) return error.TrailingJpegBytes;
                report.markers = it.count;
                report.restart_markers = restart.count;
                report.restart_interval = restart.interval;
                return report;
            },
            0xc4, 0xdb, 0xcc, 0xe0...0xef, 0xfe => report.miscellaneous_markers += 1,
            0xde, 0xdf => return error.UnsupportedJpegHierarchicalFrame,
            else => return error.UnsupportedJpegStructuralMarker,
        }
    }
}
