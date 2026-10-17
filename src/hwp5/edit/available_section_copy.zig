//! Explicit remaining-section editing copy, not recovery of missing content.
const std = @import("std");
const source_mod = @import("../text_source.zig");
const Session = @import("style_preservation.zig").Session;
pub const Report = struct { declared: u16, available: u16 };
pub const Prepared = struct { bytes: []u8, report: Report };
pub const Opened = struct { session: *Session, report: Report };

/// Caller owns bytes. Input and every non-DocInfo stream remain unchanged.
pub fn prepare(a: std.mem.Allocator, input: []const u8) !Prepared {
    var source = try source_mod.Source.openAvailableReadOnly(a, input);
    defer source.deinit();
    if (source.header.has(.distribution)) return error.UnsupportedAvailableSectionDistribution;
    if (source.declared_section_count == source.section_count) return error.SectionCountAlreadyMatches;
    const limits = source_mod.cfb_limits;
    const decoded = try source.decodeDocInfo(a, limits.max_stream_bytes);
    defer a.free(decoded);
    const site = try @import("../docinfo/section_count.zig").locate(decoded, source.header.version());
    if (site.value != source.declared_section_count) return error.SourceBindingMismatch;
    std.mem.writeInt(u16, decoded[site.payload_offset..][0..2], source.section_count, .little);
    const compressed = source.header.has(.compressed);
    const encoded = if (compressed) try @import("../../compression/raw_deflate.zig").encodeStored(a, decoded, limits.max_stream_bytes) else decoded;
    defer if (compressed) a.free(encoded);
    const bytes = try @import("../../cfb/stream_replace.zig").rebuildExact(a, &source.file, "/DocInfo", encoded, .{ .limits = limits, .max_output_bytes = limits.max_input_bytes });
    errdefer a.free(bytes);
    // Do not let the preview reader's observed-CFB fallback hide a writer error.
    var strict = try @import("../../cfb/reader.zig").File.open(a, bytes, limits);
    defer strict.deinit();
    var verified = try source_mod.Source.open(a, bytes);
    defer verified.deinit();
    if (verified.section_count != source.section_count or verified.declared_section_count != source.section_count) return error.SourceBindingMismatch;
    return .{ .bytes = bytes, .report = .{ .declared = source.declared_section_count, .available = source.section_count } };
}

/// Session owns its normalized baseline; temporary prepared bytes are freed.
pub fn open(a: std.mem.Allocator, input: []const u8) !Opened {
    const prepared = try prepare(a, input);
    defer a.free(prepared.bytes);
    return .{ .session = try Session.open(a, prepared.bytes), .report = prepared.report };
}
