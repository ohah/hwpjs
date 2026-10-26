//! One new cell paragraph. No original record/node identity or layout cache.
const std = @import("std");
const Table = @import("../../model/created_table.zig").Table;
const Version = @import("../version.zig").Version;
const Header = @import("../body/paragraph_header.zig").Header;
const list = @import("../body/list_header.zig");
const model = @import("../../model/document.zig");
const references = @import("../docinfo/reference_rules.zig");
const framing = @import("../record_writer.zig");
pub const Resources = @import("../body/paragraphs.zig").Resources;
pub const Options = struct {
    layout: list.Layout,
    unknown: ?u16,
    attributes: u32,
    margins: [4]i16,
};

/// LIST_HEADER and PARA_HEADER are siblings; text/runs are paragraph children.
/// Exactly one paragraph per cell, so its high count bit follows known topology.
/// Caller output is unchanged on failure, including late framing/allocation errors.
pub fn append(a: std.mem.Allocator, out: *std.ArrayList(u8), table: *const Table, row: u32, column: u32, version: Version, options: Options, resources: Resources, level: u10, limit: usize) !void {
    try version.requireSupported();
    if (level == std.math.maxInt(u10) or out.items.len > limit) return error.LimitExceeded;
    if ((options.layout == .observed8) != (options.unknown != null)) return error.InvalidListHeaderLayout;
    const geometry = try @import("created_table_payloads.zig").writeCell(table, row, column, options.margins);
    const cell = table.cells[@as(usize, row) * table.plan.columns + column];
    if (cell.paragraph_id == 0) return error.InvalidParagraphInstanceId;
    const paragraph = std.math.cast(u16, table.resources.paragraph) orelse return error.InvalidParagraphShapeReference;
    const style = std.math.cast(u8, table.resources.style) orelse return error.InvalidStyleReference;
    if (references.resolve(.zero_based, paragraph, resources.para_shapes) == .invalid) return error.InvalidParagraphShapeReference;
    if (references.resolve(.zero_based, style, resources.styles) == .invalid) return error.InvalidStyleReference;
    if (references.resolve(.zero_based, table.resources.character, resources.char_shapes) == .invalid) return error.InvalidCharacterShapeReference;
    const content_units = std.unicode.calcUtf16LeLen(cell.text) catch return error.InvalidTableCellText;
    const units = std.math.add(usize, content_units, 1) catch return error.LimitExceeded;
    if (units > 0x7fffffff) return error.LimitExceeded;
    const length = std.math.mul(usize, units, 2) catch return error.LimitExceeded;
    const remaining = limit - out.items.len;
    if (length > remaining) return error.LimitExceeded;
    const encoded = try std.unicode.utf8ToUtf16LeAlloc(a, cell.text);
    defer a.free(encoded);
    const text = try a.alloc(u8, length);
    defer a.free(text);
    @memcpy(text[0 .. length - 2], std.mem.sliceAsBytes(encoded));
    std.mem.writeInt(u16, text[length - 2 ..][0..2], 13, .little);
    // Reuse plain paragraph control/scalar policy rather than silently normalizing.
    try @import("plain_text_content.zig").validatePlain(text);

    var header: [24]u8 = @splat(0);
    const header_len: usize = if (version.raw >= 0x05000302) 24 else 22;
    Header.writeTextCounts(header[0..header_len], @intCast(units), 1, 0);
    std.mem.writeInt(u32, header[0..4], @as(u32, @intCast(units)) | 0x80000000, .little);
    std.mem.writeInt(u16, header[Header.para_shape_id_offset..][0..2], paragraph, .little);
    header[Header.style_id_offset] = style;
    std.mem.writeInt(u32, header[Header.instance_id_offset..][0..4], cell.paragraph_id, .little);
    var line_token: [1]model.Token = undefined;
    var line_count: usize = 0;
    var tokens = try @import("../body/text.zig").Iterator.init(text);
    while (try tokens.next()) |token| {
        if (token.value == .control and token.value.control.code == 10) {
            line_token[0] = .{ .start_unit = @intCast(token.start_unit), .kind = .control, .encoding = .utf16le, .raw = @constCast(token.raw) };
            line_count = 1;
            break;
        }
    }
    try @import("line_break_mask.zig").write(header[0..header_len], line_token[0..line_count]);
    var runs: [8]u8 = @splat(0);
    std.mem.writeInt(u32, runs[4..8], table.resources.character, .little);
    var cell_list: [34]u8 = @splat(0);
    std.mem.writeInt(u16, cell_list[0..2], 1, .little);
    const list_len: usize = if (options.layout == .observed8) 8 else 6;
    const attributes_at: usize = if (options.layout == .observed8) 4 else 2;
    if (options.unknown) |unknown| std.mem.writeInt(u16, cell_list[2..4], unknown, .little);
    std.mem.writeInt(u32, cell_list[attributes_at..][0..4], options.attributes, .little);
    @memcpy(cell_list[list_len..][0..26], &geometry);
    var draft: std.ArrayList(u8) = .empty;
    defer draft.deinit(a);
    try framing.append(a, &draft, 72, level, cell_list[0 .. list_len + 26], remaining);
    try framing.append(a, &draft, 66, level, header[0..header_len], remaining);
    try framing.append(a, &draft, 67, level + 1, text, remaining);
    try framing.append(a, &draft, 68, level + 1, &runs, remaining);
    try out.appendSlice(a, draft.items);
}
