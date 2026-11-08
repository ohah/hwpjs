//! 새 그림 리소스와 문단을 한 번의 CFB 작성으로 결합하는 독립 파일 변환입니다.
const std = @import("std");
const insertion = @import("../../image/image_insertion.zig");
const Source = @import("../text_source.zig").Source;
const paths = @import("../container/paths.zig");
const framing = @import("../record.zig");
const writer = @import("../../cfb/writer.zig");
const Bitmap = std.StaticBitSet(65536);
const stream_limit = 32 * 1024 * 1024;

const ResourcePlan = struct { count: u16, at: usize, mapping: usize, physical: u16 };
fn resources(source: *const Source, info: []const u8, storage: ?usize) !ResourcePlan {
    var used = Bitmap.empty;
    used.set(0);
    if (storage) |parent| for (source.file.entries) |entry| {
        if (entry.parent != parent or entry.name.len < 7 or !std.ascii.eqlIgnoreCase(entry.name[0..3], "BIN")) continue;
        const id = std.fmt.parseInt(u16, entry.name[3..7], 16) catch continue;
        used.set(id);
    };
    var iterator = framing.Iterator.init(info, .{});
    var mapping: ?usize = null;
    var declared: ?i32 = null;
    var count: usize = 0;
    var at: ?usize = null;
    var binary_owner = false;
    while (try iterator.next()) |row| {
        if (row.tag == 17) {
            if (mapping != null or row.level != 0) return error.InvalidIdMappings;
            const value = try @import("../docinfo/id_mappings.zig").IdMappings.parse(row.payload, source.header.version());
            declared = value.get(.bin_data).?;
            mapping = row.offset + row.raw.len - row.payload.len;
            at = row.offset + row.raw.len;
        }
        if (row.tag == 18) {
            if (mapping == null or row.level != 1) return error.InvalidDocInfoLevel;
            const value = try @import("../docinfo/bin_data.zig").BinData.parse(row.payload);
            if (value.data == .unknown) return error.UnsupportedBinDataType;
            if (try value.target(.observed_optional_extension)) |target| {
                if (target.id == 0) return error.InvalidBinaryResourceId;
                used.set(target.id);
            }
            count += 1;
            at = row.offset + row.raw.len;
            binary_owner = true;
        } else if (binary_owner) {
            if (row.level > 1) at = row.offset + row.raw.len else binary_owner = false;
        }
    }
    const expected = declared orelse return error.MissingIdMappings;
    if (expected < 0 or @as(usize, @intCast(expected)) != count) return error.ResourceCountMismatch;
    if (count >= 65535) return error.LimitExceeded;
    for (1..65536) |id| if (!used.isSet(id)) return .{ .count = @intCast(count), .at = at.?, .mapping = mapping.?, .physical = @intCast(id) };
    return error.BinaryResourceIdsExhausted;
}

fn instance(a: std.mem.Allocator, source: *const Source, target_section: usize, target_bytes: []const u8) !u32 {
    var used: std.AutoHashMapUnmanaged(u32, void) = .empty;
    defer used.deinit(a);
    var total: usize = 0;
    for (0..source.section_count) |section| {
        const bytes = if (section == target_section) target_bytes else try source.decodeSection(a, section);
        defer if (section != target_section) a.free(bytes);
        if (bytes.len > insertion.picture_input.max_document_bytes -| total) return error.LimitExceeded;
        total += bytes.len;
        var iterator = framing.Iterator.init(bytes, .{});
        while (try iterator.next()) |row| {
            if (row.tag == 66) {
                const value = try @import("../body/paragraph_header.zig").Header.parse(row.payload, source.header.version());
                try used.put(a, value.instance_id, {});
            } else if (row.tag == 71) {
                const header = try @import("../body/control_header.zig").Header.parse(row.payload);
                if (@import("../body/object_common.zig").supports(header.id)) {
                    const value = try @import("../body/object_common.zig").parseControl(header);
                    try used.put(a, value.instance_id, {});
                }
            } else if (row.tag == 85 and row.payload.len != 73) {
                // instance를 포함하는 검증 가능한 prefix만 읽습니다. 불명확한 꼬리를 ID로 추측하지 않습니다.
                const value = try @import("../body/shape_picture.zig").Picture.parse(row.payload, .interleaved, .with_instance78);
                var reader: @import("../../binary/reader.zig").Reader = .{ .bytes = value.extra };
                _ = try @import("../body/picture_tail.zig").Tail.read(&reader, null);
                if (reader.offset != reader.bytes.len) return error.UnsupportedPictureInsertionIdentity;
                try used.put(a, value.instance_id.?, {});
            }
        }
    }
    var id: u32 = 1;
    while (used.contains(id)) id = std.math.add(u32, id, 1) catch return error.PictureInstanceIdsExhausted;
    return id;
}

fn encode(a: std.mem.Allocator, source: *const Source, bytes: []const u8) ![]u8 {
    if (source.header.has(.compressed)) return @import("../../compression/raw_deflate.zig").encodeStored(a, bytes, stream_limit);
    if (bytes.len > stream_limit) return error.LimitExceeded;
    return a.dupe(u8, bytes);
}

/// 입력은 빌린 바이트이며, 성공한 새 파일만 호출자가 소유합니다. Session·이력에는 접근하지 않습니다.
pub fn prepare(a: std.mem.Allocator, input: []const u8, image: []const u8, request: insertion.Request) !insertion.Result {
    const validated = try insertion.validateInput(input, image, request);
    const media = validated.media;
    var source = try Source.open(a, input);
    defer source.deinit();
    if (source.header.has(.digital_signature) or source.header.has(.signature_preview)) return error.UnsupportedPictureInsertionSignature;
    if (request.target.section >= source.section_count) return error.InvalidSection;
    const original = try source.decodeSection(a, request.target.section);
    defer a.free(original);
    const info = try source.decodeDocInfo(a, stream_limit);
    defer a.free(info);
    const storage = try source.file.findExact("/BinData");
    if (storage) |index| if (source.file.entries[index].kind != 1) return error.NotAStorage;
    const plan = try resources(&source, info, storage);
    const id = try instance(a, &source, request.target.section, original);
    const changed = try @import("image_insertion_section.zig").write(a, original, source.header.version(), request, plan.count + 1, id, stream_limit);
    defer a.free(changed);
    var payload: [12]u8 = @splat(0);
    std.mem.writeInt(u16, payload[0..2], 0x21, .little);
    std.mem.writeInt(u16, payload[2..4], plan.physical, .little);
    std.mem.writeInt(u16, payload[4..6], @intCast(media.extension.len), .little);
    for (media.extension, 0..) |byte, index| std.mem.writeInt(u16, payload[6 + index * 2 ..][0..2], byte, .little);
    const path = try paths.binary(a, plan.physical, payload[6..12]);
    errdefer a.free(path);
    const changed_info = try @import("docinfo_resource_append.zig").write(a, info, plan.at, plan.mapping, plan.count, 18, &payload, stream_limit);
    defer a.free(changed_info);
    const encoded_info = try encode(a, &source, changed_info);
    defer a.free(encoded_info);
    const encoded_section = try encode(a, &source, changed);
    defer a.free(encoded_section);
    const previous = try source.file.toNodes(a);
    defer a.free(previous);
    const nodes = try a.alloc(writer.Node, previous.len + (if (storage == null) @as(usize, 2) else 1));
    defer a.free(nodes);
    @memcpy(nodes[0..previous.len], previous);
    const storage_node: u32 = if (storage) |index| @intCast(try source.file.nodeIndex(index)) else @intCast(previous.len);
    if (storage == null) nodes[previous.len] = .{ .name = "BinData", .parent = 0, .kind = 1 };
    nodes[nodes.len - 1] = .{ .name = path["/BinData/".len..], .parent = storage_node, .content = image };
    const section_path = try std.fmt.allocPrint(a, "/BodyText/Section{d}", .{request.target.section});
    defer a.free(section_path);
    nodes[try source.file.nodeIndex(try paths.required(&source.file, "/DocInfo", 2))].content = encoded_info;
    nodes[try source.file.nodeIndex(try paths.required(&source.file, section_path, 2))].content = encoded_section;
    const bytes = try writer.write(a, nodes, .{ .version = source.file.header.major, .limits = @import("../text_source.zig").cfb_limits });
    errdefer a.free(bytes);
    var checked = try Source.open(a, bytes);
    defer checked.deinit();
    const actual = checked.file.entries[try paths.required(&checked.file, path, 2)].content;
    if (!std.mem.eql(u8, actual, image)) return error.PictureInsertionVerificationFailed;
    const check_section = try checked.decodeSection(a, request.target.section);
    defer a.free(check_section);
    const inventory = try @import("picture_sources.zig").read(a, check_section, checked.header.version(), .base73);
    defer a.free(inventory);
    var found: usize = 0;
    for (inventory) |picture| if (picture.bin_data_id == plan.count + 1) {
        found += 1;
    };
    if (found != 1) return error.PictureInsertionVerificationFailed;
    return .{ .bytes = bytes, .resource_path = path, .instance_id = id };
}
