const std = @import("std");
const structure = @import("structure.zig");
const markers = @import("markers.zig");
const jfif = @import("jfif.zig");
const jfxx = @import("jfxx.zig");
const frame = @import("frame.zig");

pub const Report = struct {
    structure: structure.Report,
    /// Borrows immutable input, including the optional packed RGB thumbnail.
    header: jfif.Header,
    extensions: usize,
    unknown_extensions: usize,
    /// Layout inspection never certifies compressed thumbnail entropy.
    compressed_thumbnails_unchecked: usize,
    application_markers: usize,
};

/// T.871 6.3-6.5 placement and known raw payload checks, not full JFIF
/// conformance or pixel decoding. Uses the existing compatible JFIF 1.x reader.
pub fn inspect(bytes: []const u8, options: structure.Options) !Report {
    var state: State = .{};
    const report = try structure.inspectWithContext(bytes, options, &state, State.accept);
    return .{
        .structure = report,
        .header = state.header orelse return error.MissingJfifHeader,
        .extensions = state.extensions,
        .unknown_extensions = state.unknown_extensions,
        .compressed_thumbnails_unchecked = state.compressed,
        .application_markers = state.applications,
    };
}

const State = struct {
    phase: enum { soi, header, extensions, rest } = .soi,
    header: ?jfif.Header = null,
    extensions: usize = 0,
    unknown_extensions: usize = 0,
    compressed: usize = 0,
    applications: usize = 0,

    fn accept(self: *State, marker: markers.Marker) !void {
        if (self.phase == .soi) {
            // The shared inspector already requires SOI as the first marker.
            self.phase = .header;
            return;
        }
        const is_jfif = marker.code == 0xe0 and std.mem.startsWith(u8, marker.payload, "JFIF\x00");
        const is_jfxx = marker.code == 0xe0 and std.mem.startsWith(u8, marker.payload, "JFXX\x00");
        if (self.phase == .header) {
            if (!is_jfif) return error.MissingJfifHeader;
            self.header = try jfif.Header.parse(marker.payload);
            self.phase = .extensions;
            return;
        }
        if (is_jfif) return error.DuplicateJfifHeader;
        if (is_jfxx) {
            if (self.phase != .extensions) return error.InvalidJfxxPosition;
            const extension = try jfxx.Extension.parse(marker.payload);
            switch (extension) {
                .jpeg_unchecked => self.compressed += 1,
                .unknown => self.unknown_extensions += 1,
                else => {},
            }
            self.extensions += 1;
            return;
        }
        self.phase = .rest;
        if (marker.code >= 0xe0 and marker.code <= 0xef) {
            // Other APPn identifiers are application-specific. Only APP0 has
            // the T.871 NUL-terminated application identifier requirement.
            if (marker.code == 0xe0 and std.mem.indexOfScalar(u8, marker.payload, 0) == null) return error.UnterminatedJfifApplicationId;
            self.applications += 1;
        }
        if (structure.isFrame(marker.code)) {
            const parsed = try frame.parse(marker.code, marker.payload, .{ .max_pixels = std.math.maxInt(u64) });
            try jfif.validateFrame(parsed);
        }
    }
};
