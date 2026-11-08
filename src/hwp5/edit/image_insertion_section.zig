//! 최상위 원본 문단의 명시 UTF-16 위치에 그림 컨트롤과 하위 레코드를 삽입합니다.
const std = @import("std");
const insertion = @import("../../image/image_insertion.zig");
const Version = @import("../version.zig").Version;
const records = @import("image_insertion_records.zig");

pub fn write(a: std.mem.Allocator, source: []const u8, version: Version, request: insertion.Request, ordinal: u16, instance_id: u32, limit: usize) ![]u8 {
    var tree = try @import("source_tree.zig").parse(a, source, version, .{});
    defer tree.deinit(a);
    var links = try @import("../body/control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    try @import("field_free_section.zig").validate(tree);
    var projection = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{source});
    defer projection.deinit(a);
    const paragraphs = projection.sections[0].paragraphs;
    if (request.target.paragraph >= paragraphs.len) return error.InvalidParagraph;
    const paragraph = paragraphs[request.target.paragraph];
    if (paragraph.parent_node != null) return error.UnsupportedPictureInsertionHost;
    const node = paragraph.source_node orelse return error.SourceBindingMismatch;
    const raw = try @import("plain_text_content.zig").textBytes(a, paragraph);
    defer a.free(raw);
    const actual = try insertion.utf8FromUtf16(a, raw);
    defer a.free(actual);
    _ = try insertion.verifyText(actual, request);
    try @import("control_boundaries.zig").validate(raw, request.target.unit, request.target.unit);
    var text = try @import("../body/text.zig").Iterator.init(raw);
    var prefix_end: usize = 0;
    while (try text.next()) |token| {
        if (token.value != .control) continue;
        const control = token.value.control;
        if (control.code == 13 and token.start_unit + 1 == raw.len / 2) continue;
        if (control.code == 2 and token.start_unit == prefix_end) {
            const id = std.mem.readInt(u32, control.data[0..4], .little);
            const rules = @import("../body/control_rules.zig");
            if (id == rules.section_id or id == rules.column_id) {
                prefix_end = token.start_unit + 8;
                continue;
            }
        }
        return error.UnsupportedPictureInsertionControl;
    }
    if (request.target.unit < prefix_end) return error.InvalidPictureInsertionPosition;
    if (paragraph.range_tags) |ranges| if (ranges.len != 0) return error.UnsupportedRangeSemantics;
    if (paragraph.character_runs.len == 0) return error.UnsupportedMissingCharacterRuns;
    const runs = try @import("character_runs.zig").replace(a, paragraph.character_runs, request.target.unit, request.target.unit, 8, null);
    defer a.free(runs);
    if (runs.len > 65535) return error.LimitExceeded;
    const encoded_runs = try @import("character_run_payload.zig").encode(a, runs);
    defer a.free(encoded_runs);
    if (node >= tree.nodes.len) return error.SourceBindingMismatch;
    const owner = tree.nodes[node];
    if (owner.parent != null) return error.UnsupportedPictureInsertionHost;
    const children = try @import("../body/paragraph_children.zig").collect(tree, node);
    const text_node = children.text_node orelse return error.UnsupportedEmptyPictureInsertionText;
    const payloads = try records.create(try insertion.size(request), ordinal, instance_id);
    const controls = try records.encode(a, &payloads, owner.record.framing.level, limit);
    defer a.free(controls);
    const header = try a.dupe(u8, owner.record.framing.payload);
    defer a.free(header);
    const Header = @import("../body/paragraph_header.zig").Header;
    const parsed = try Header.parse(header, version);
    if (parsed.range_tag_count != 0 or parsed.extra.len != 0 or (parsed.merge_tracking orelse 0) != 0) return error.UnsupportedPictureInsertionHost;
    Header.writeTextCounts(header, std.math.add(u32, @intCast(raw.len / 2), 8) catch return error.LimitExceeded, @intCast(runs.len), 0);
    std.mem.writeInt(u32, header[4..8], parsed.control_mask | (1 << 11), .little);
    const changed_text = try a.alloc(u8, raw.len + 16);
    defer a.free(changed_text);
    const at = @as(usize, request.target.unit) * 2;
    @memcpy(changed_text[0..at], raw[0..at]);
    @memcpy(changed_text[at..][0..16], &payloads.text_control);
    @memcpy(changed_text[at + 16 ..], raw[at..]);
    var output: std.ArrayList(u8) = .empty;
    errdefer output.deinit(a);
    const writer = @import("../record_writer.zig");
    var index: usize = 0;
    while (index < tree.nodes.len) {
        const row = tree.nodes[index];
        if (index == node) {
            try writer.append(a, &output, 66, row.record.framing.level, header, limit);
            index += 1;
        } else if (index > node and index < owner.subtree_end) {
            if (row.parent != node) return error.UnsupportedPictureInsertionHost;
            switch (row.record.framing.tag) {
                67 => {
                    if (index != text_node) return error.SourceBindingMismatch;
                    try writer.append(a, &output, 67, row.record.framing.level, changed_text, limit);
                },
                68 => try writer.append(a, &output, 68, row.record.framing.level, encoded_runs, limit),
                // 새 그림에 의해 기존 줄 배치가 달라지므로 대상의 오래된 줄 캐시만 제거합니다.
                69 => {},
                71 => {
                    const control = try @import("../body/control_header.zig").Header.parse(row.record.framing.payload);
                    const rules = @import("../body/control_rules.zig");
                    if (control.id != rules.section_id and control.id != rules.column_id) return error.UnsupportedPictureInsertionControl;
                    const end = if (row.subtree_end < tree.nodes.len) tree.nodes[row.subtree_end].record.framing.offset else source.len;
                    try append(a, &output, source[row.record.framing.offset..end], limit);
                },
                else => return error.UnsupportedPictureInsertionHost,
            }
            index = row.subtree_end;
        } else {
            try append(a, &output, row.record.framing.raw, limit);
            index += 1;
        }
        if (index == owner.subtree_end) try append(a, &output, controls, limit);
    }
    return output.toOwnedSlice(a);
}

fn append(a: std.mem.Allocator, output: *std.ArrayList(u8), bytes: []const u8, limit: usize) !void {
    if (bytes.len > limit -| output.items.len) return error.LimitExceeded;
    try output.appendSlice(a, bytes);
}
