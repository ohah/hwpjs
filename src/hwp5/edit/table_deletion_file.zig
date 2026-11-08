//! 메모리 기반 파일 변환. 원본 컨테이너와 열린 편집 세션은 변경하지 않는다.
const std = @import("std");
pub const Options = struct {
    max_input_bytes: usize = 64 * 1024 * 1024,
    max_output_bytes: usize = 128 * 1024 * 1024,
    max_section_bytes: usize = 64 * 1024 * 1024,
    max_records: usize = 1_000_000,
};

pub fn transform(a: std.mem.Allocator, input: []const u8, section: usize, table_nodes: []const usize, options: Options) ![]u8 {
    if (input.len == 0 or input.len > options.max_input_bytes) return error.LimitExceeded;
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    var source = try @import("../text_source.zig").Source.open(scratch, input);
    defer source.deinit();
    if (!std.mem.eql(u8, input, source.file.bytes)) return error.RepairedSourceUnsupported;
    if (source.header.has(.history) or source.header.has(.digital_signature) or source.header.has(.signature_preview)) return error.UnsupportedTableDeletionSaveFeatures;
    if (section >= source.section_count) return error.InvalidSection;
    const info = try source.decodeDocInfo(scratch, options.max_section_bytes);
    const resources = try @import("../docinfo/resources.zig").inspect(info, source.header.version(), .{ .max_records = options.max_records });
    try resources.validateKnownCounts();
    const raw = try source.decodeSection(scratch, section);
    const changed = try @import("table_deletion.zig").prepareMany(scratch, raw, source.header.version(), table_nodes, .{
        .max_bytes = options.max_section_bytes,
        .max_records = options.max_records,
        .char_shape_count = resources.count(.char_shape),
    });
    const stored = if (source.header.has(.compressed)) try @import("../../compression/raw_deflate.zig").encodeStored(scratch, changed, options.max_output_bytes) else changed;
    const path = try std.fmt.allocPrint(scratch, "/BodyText/Section{d}", .{section});
    return @import("../../cfb/stream_replace.zig").rebuildExact(a, &source.file, path, stored, .{ .max_output_bytes = options.max_output_bytes });
}
