//! 기존 그림 한 개의 참조만 새 BinData로 연결하는 독립 메모리 변환입니다.
//! 그림 삽입·세션 이력·픽셀 디코딩·조판 변경은 수행하지 않습니다.
const std = @import("std");
const Source = @import("../text_source.zig").Source;
const framing = @import("../record.zig");
const BinData = @import("../docinfo/bin_data.zig").BinData;
const Version = @import("../version.zig").Version;
const Bitmap = std.StaticBitSet(65536);
const writer = @import("../../cfb/writer.zig");
const paths = @import("../container/paths.zig");

pub const Options = struct {
    max_input_bytes: usize = 64 * 1024 * 1024,
    max_image_bytes: usize = 8 * 1024 * 1024,
    max_stream_bytes: usize = 32 * 1024 * 1024,
    max_output_bytes: usize = 64 * 1024 * 1024,
};
pub const Result = struct {
    bytes: []u8,
    bin_data_ordinal: u16,
    storage_id: u16,
    resource_path: []u8,
    media_type: []const u8,
    preview_stale: bool = true,

    pub fn deinit(self: *Result, a: std.mem.Allocator) void {
        a.free(self.bytes);
        a.free(self.resource_path);
        self.* = undefined;
    }
};
const InfoPlan = struct {
    count: usize,
    at: usize,
    mapping_offset: usize,
    selected: BinData,
};

fn inspectInfo(bytes: []const u8, version: Version, ordinal: u16, used: *Bitmap) !InfoPlan {
    var records = framing.Iterator.init(bytes, .{});
    var count: usize = 0;
    var declared: ?i32 = null;
    var mapping_offset: ?usize = null;
    var selected: ?BinData = null;
    var at: ?usize = null;
    var binary_owner = false;
    while (try records.next()) |record| {
        if (record.tag == 17) {
            if (declared != null) return error.DuplicateIdMappings;
            if (record.level != 0) return error.InvalidDocInfoLevel;
            const mappings = try @import("../docinfo/id_mappings.zig").IdMappings.parse(record.payload, version);
            declared = mappings.get(.bin_data).?;
            mapping_offset = record.offset + record.raw.len - record.payload.len;
        }
        if (record.tag == 18) {
            if (record.level != 1) return error.InvalidDocInfoLevel;
            if (declared == null) return error.MissingIdMappings;
            count += 1;
            if (count > std.math.maxInt(u16)) return error.LimitExceeded;
            const item = try BinData.parse(record.payload);
            switch (item.data) {
                .unknown => return error.UnsupportedBinDataType,
                .link => {},
                else => {
                    const target = (try item.target(.observed_optional_extension)).?;
                    if (target.id == 0) return error.InvalidBinaryResourceId;
                    used.set(target.id);
                },
            }
            if (count == ordinal) selected = item;
            at = record.offset + record.raw.len;
            binary_owner = true;
        } else if (binary_owner) {
            // 원본 리소스의 미지 자식 레코드를 새 항목의 자식으로 옮기지 않습니다.
            if (record.level > 1) at = record.offset + record.raw.len else binary_owner = false;
        }
    }
    const n = declared orelse return error.MissingIdMappings;
    if (n < 0) return error.NegativeMappingCount;
    if (@as(usize, @intCast(n)) != count) return error.ResourceCountMismatch;
    if (ordinal == 0 or selected == null) return error.InvalidPictureBinaryResource;
    return .{ .count = count, .at = at orelse return error.InvalidPictureBinaryResource, .mapping_offset = mapping_offset.?, .selected = selected.? };
}

fn reserveName(used: *Bitmap, name: []const u8) void {
    if (name.len < 7 or !std.ascii.eqlIgnoreCase(name[0..3], "BIN")) return;
    const id = std.fmt.parseInt(u16, name[3..7], 16) catch return;
    used.set(id);
}
fn encode(a: std.mem.Allocator, source: *const Source, bytes: []const u8, limit: usize) ![]u8 {
    if (source.header.has(.compressed)) return @import("../../compression/raw_deflate.zig").encodeStored(a, bytes, limit);
    if (bytes.len > limit) return error.LimitExceeded;
    return a.dupe(u8, bytes);
}

/// 입력과 기존 리소스는 빌리며, 검사·재열기가 끝난 새 CFB만 반환합니다.
pub fn prepare(a: std.mem.Allocator, input: []const u8, section: usize, picture_node: usize, image: []const u8, options: Options) !Result {
    if (input.len == 0 or input.len > @min(options.max_input_bytes, 64 * 1024 * 1024)) return error.LimitExceeded;
    // 기존 PNG/JPEG 구조·CRC·프레임 검사 정책을 재사용합니다. HWPX 작성기는 호출하지 않습니다.
    const media = try @import("../../image/picture_input.zig").inspectImage(image, options.max_image_bytes);
    var source = try Source.open(a, input);
    defer source.deinit();
    if (source.header.has(.digital_signature) or source.header.has(.signature_preview)) return error.UnsupportedPictureReplacementSignature;
    if (section >= source.section_count) return error.InvalidSection;
    const limit = @min(options.max_stream_bytes, 32 * 1024 * 1024);
    const original_section = try source.decodeSection(a, section);
    defer a.free(original_section);
    if (original_section.len > limit) return error.LimitExceeded;
    const pictures = try @import("picture_sources.zig").read(a, original_section, source.header.version(), .base73);
    defer a.free(pictures);
    var ordinal: ?u16 = null;
    for (pictures) |picture| if (picture.picture_node == picture_node) {
        if (ordinal != null) return error.AmbiguousPictureResourceTarget;
        ordinal = picture.bin_data_id;
    };
    if (ordinal == null) return error.InvalidPictureResourceTarget;
    const original_info = try source.decodeDocInfo(a, limit);
    defer a.free(original_info);
    var used = Bitmap.empty;
    used.set(0);
    const plan = try inspectInfo(original_info, source.header.version(), ordinal.?, &used);
    if (plan.count >= std.math.maxInt(u16)) return error.LimitExceeded;
    if (plan.selected.data == .link) return error.ExternalPictureImage;
    const old_target = (try plan.selected.target(.observed_optional_extension)) orelse return error.UnsupportedBinDataType;
    _ = try plan.selected.isCompressed(source.header.has(.compressed));
    const old_path = try paths.binary(a, old_target.id, old_target.extension_utf16 orelse &.{});
    defer a.free(old_path);
    _ = try paths.required(&source.file, old_path, 2);
    const storage = try paths.required(&source.file, "/BinData", 1);
    for (source.file.entries) |entry| if (entry.parent == storage and entry.kind != 0) reserveName(&used, entry.name);
    var available: ?u16 = null;
    for (1..65536) |id| if (!used.isSet(id)) {
        available = @intCast(id);
        break;
    };
    const physical = available orelse return error.BinaryResourceIdsExhausted;
    const next: u16 = @intCast(plan.count + 1);
    var payload: [32]u8 = undefined;
    if (media.extension.len > 13) return error.UnsupportedReplacementImageFormat;
    // 새 항목은 내장·명시적 비압축입니다. 원본의 항목별 압축·확장은 그대로 둡니다.
    std.mem.writeInt(u16, payload[0..2], 0x21, .little);
    std.mem.writeInt(u16, payload[2..4], physical, .little);
    std.mem.writeInt(u16, payload[4..6], @intCast(media.extension.len), .little);
    for (media.extension, 0..) |byte, i| std.mem.writeInt(u16, payload[6 + i * 2 ..][0..2], byte, .little);
    const extension = payload[6 .. 6 + media.extension.len * 2];
    const path = try paths.binary(a, physical, extension);
    errdefer a.free(path);
    const info = try @import("docinfo_resource_append.zig").write(a, original_info, plan.at, plan.mapping_offset, @intCast(plan.count), 18, payload[0 .. 6 + extension.len], limit);
    defer a.free(info);
    const updated_section = try a.dupe(u8, original_section);
    defer a.free(updated_section);
    var tree = try @import("source_tree.zig").parse(a, original_section, source.header.version(), .{});
    defer tree.deinit(a);
    if (picture_node >= tree.nodes.len) return error.InvalidPictureResourceTarget;
    const record = tree.nodes[picture_node].record.framing;
    if (record.tag != 85 or record.payload.len < 73) return error.InvalidPictureResourceTarget;
    const offset = record.offset + record.raw.len - record.payload.len + 71;
    std.mem.writeInt(u16, updated_section[offset..][0..2], next, .little);
    const encoded_info = try encode(a, &source, info, limit);
    defer a.free(encoded_info);
    const encoded_section = try encode(a, &source, updated_section, limit);
    defer a.free(encoded_section);
    const old_nodes = try source.file.toNodes(a);
    defer a.free(old_nodes);
    const nodes = try a.alloc(writer.Node, old_nodes.len + 1);
    defer a.free(nodes);
    @memcpy(nodes[0..old_nodes.len], old_nodes);
    const section_path = try std.fmt.allocPrint(a, "/BodyText/Section{d}", .{section});
    defer a.free(section_path);
    const info_index = try paths.required(&source.file, "/DocInfo", 2);
    const section_index = try paths.required(&source.file, section_path, 2);
    nodes[try source.file.nodeIndex(info_index)].content = encoded_info;
    nodes[try source.file.nodeIndex(section_index)].content = encoded_section;
    nodes[old_nodes.len] = .{ .name = path["/BinData/".len..], .parent = @intCast(try source.file.nodeIndex(storage)), .content = image };
    var limits = @import("../text_source.zig").cfb_limits;
    limits.max_input_bytes = @min(options.max_output_bytes, 64 * 1024 * 1024);
    const output = try writer.write(a, nodes, .{ .version = source.file.header.major, .limits = limits });
    errdefer a.free(output);
    var checked = try Source.open(a, output);
    defer checked.deinit();
    const actual = checked.file.entries[try paths.required(&checked.file, path, 2)].content;
    if (!std.mem.eql(u8, actual, image)) return error.PictureReplacementVerificationFailed;
    const checked_info = try checked.decodeDocInfo(a, limit);
    defer a.free(checked_info);
    var verified_ids = Bitmap.empty;
    const verified = try inspectInfo(checked_info, checked.header.version(), next, &verified_ids);
    if (verified.count != plan.count + 1 or verified.selected.data != .embedding or verified.selected.data.embedding.id != physical) return error.PictureReplacementVerificationFailed;
    const checked_section = try checked.decodeSection(a, section);
    defer a.free(checked_section);
    const checked_pictures = try @import("picture_sources.zig").read(a, checked_section, checked.header.version(), .base73);
    defer a.free(checked_pictures);
    var linked = false;
    for (checked_pictures) |picture| if (picture.picture_node == picture_node and picture.bin_data_id == next) {
        linked = true;
    };
    if (!linked) return error.PictureReplacementVerificationFailed;
    return .{ .bytes = output, .bin_data_ordinal = next, .storage_id = physical, .resource_path = path, .media_type = media.mime };
}
