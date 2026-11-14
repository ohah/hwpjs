//! Source-only candidate: authored inline HWPX equation, immutable ZIP result.
//! Script is opaque text. No equation parser, renderer or inferred geometry.
const std = @import("std");
const inline_insert = @import("inline_object_insert.zig");
const package = @import("package.zig");
const editor = @import("editor_session.zig");
pub const Target = inline_insert.Target;
pub const Request = struct {
    expected_source_sha256: [32]u8,
    target: Target,
    script: []const u8,
    width: u32,
    height: u32,
    base_line: u32,
    base_unit: u32,
    version: []const u8,
    font: []const u8,
};
pub const Options = struct {
    max_input_bytes: usize = 64 * 1024 * 1024,
    max_output_bytes: usize = 128 * 1024 * 1024,
    max_xml_bytes: usize = 16 * 1024 * 1024,
    max_total_xml_bytes: usize = 128 * 1024 * 1024,
    max_script_bytes: usize = (@import("equation_script_write.zig").Options{}).max_script_bytes,
};
pub const Prepared = struct {
    bytes: []u8,
    object_id: u32,
    equation_node: usize,
    layout_requires_reflow: bool = true,
    preview_stale: bool = true,
    pub fn deinit(self: *Prepared, a: std.mem.Allocator) void {
        a.free(self.bytes);
        self.* = undefined;
    }
};

/// Wire parser is explicit and separate from script syntax. All fields required.
/// JSON owns strings; Request borrows them until ParsedRequest.deinit().
pub const Wire = struct {
    section: usize,
    paragraph: usize,
    start: u32,
    expectedText: []const u8,
    script: []const u8,
    width: u32,
    height: u32,
    baseLine: u32,
    baseUnit: u32,
    version: []const u8,
    font: []const u8,
};
pub const ParsedRequest = struct {
    json: std.json.Parsed(Wire),
    request: Request,
    pub fn deinit(self: *ParsedRequest) void {
        self.json.deinit();
        self.* = undefined;
    }
};
pub fn parseRequest(a: std.mem.Allocator, bytes: []const u8, source_sha256: [32]u8) !ParsedRequest {
    // Six escaped bytes per UTF-8 byte plus bounded request metadata.
    if (bytes.len > 32 * 1024 * 1024) return error.LimitExceeded;
    // Typed JSON integer decoding may accept quoted numbers. Verify wire kinds
    // before decoding so SDK/ABI callers have one strict request contract.
    const kinds = try std.json.parseFromSlice(std.json.Value, a, bytes, .{ .duplicate_field_behavior = .@"error" });
    defer kinds.deinit();
    if (kinds.value != .object or kinds.value.object.count() != 11) return error.InvalidEquationInsertRequest;
    for ([_][]const u8{ "section", "paragraph", "start", "width", "height", "baseLine", "baseUnit" }) |key| {
        const value = kinds.value.object.get(key) orelse return error.InvalidEquationInsertRequest;
        if (value != .integer or value.integer < 0) return error.InvalidEquationInsertRequest;
    }
    for ([_][]const u8{ "expectedText", "script", "version", "font" }) |key| {
        const value = kinds.value.object.get(key) orelse return error.InvalidEquationInsertRequest;
        if (value != .string) return error.InvalidEquationInsertRequest;
    }
    const parsed = try std.json.parseFromSlice(Wire, a, bytes, .{
        .allocate = .alloc_always,
        .ignore_unknown_fields = false,
        .duplicate_field_behavior = .@"error",
    });
    errdefer parsed.deinit();
    const wire = parsed.value;
    const request: Request = .{
        .expected_source_sha256 = source_sha256,
        .target = .{ .section = wire.section, .paragraph = wire.paragraph, .unit = wire.start, .expected_text = wire.expectedText },
        .script = wire.script,
        .width = wire.width,
        .height = wire.height,
        .base_line = wire.baseLine,
        .base_unit = wire.baseUnit,
        .version = wire.version,
        .font = wire.font,
    };
    try validate(a, request, .{});
    return .{ .json = parsed, .request = request };
}

pub fn validate(a: std.mem.Allocator, request: Request, options: Options) !void {
    if (request.target.section != 0) return error.UnsupportedInsertSections;
    if (request.width == 0 or request.height == 0 or request.base_unit == 0 or
        request.width > std.math.maxInt(i32) or request.height > std.math.maxInt(i32) or request.base_unit > std.math.maxInt(i32))
        return error.InvalidEquationInsertionSize;
    if (request.version.len == 0 or request.font.len == 0 or request.version.len > 128 or request.font.len > 128)
        return error.InvalidEquationInsertionMetadata;
    if (request.target.paragraph == 0) return error.InvalidParagraphIndex;
    try @import("equation_script_write.zig").validateValue(a, request.script, .{
        .max_script_bytes = @min(options.max_script_bytes, (@import("equation_script_write.zig").Options{}).max_script_bytes),
        .max_output_bytes = options.max_xml_bytes,
    });
    _ = try @import("../image/image_insertion.zig").byteOffset(request.target.expected_text, request.target.unit);
    for ([_][]const u8{ request.version, request.font }) |value| {
        const encoded = try @import("../xml/attribute_writer.zig").encode(a, value, 768);
        a.free(encoded);
    }
}

pub fn createXml(a: std.mem.Allocator, request: Request, object_id: u32, options: Options) ![]u8 {
    try validate(a, request, options);
    if (object_id == 0) return error.InvalidEquationInsertionIdentity;
    const script = try @import("../xml/text_writer.zig").encode(a, request.script, options.max_xml_bytes);
    defer a.free(script);
    const version = try @import("../xml/attribute_writer.zig").encode(a, request.version, 768);
    defer a.free(version);
    const font = try @import("../xml/attribute_writer.zig").encode(a, request.font, 768);
    defer a.free(font);
    const bytes = try std.fmt.allocPrint(a, "<hp:equation xmlns:hp=\"http://www.hancom.co.kr/hwpml/2011/paragraph\" id=\"{d}\" zOrder=\"0\" numberingType=\"EQUATION\" textWrap=\"SQUARE\" textFlow=\"BOTH_SIDES\" lock=\"0\" dropcapstyle=\"None\" version=\"{s}\" baseLine=\"{d}\" textColor=\"#000000\" baseUnit=\"{d}\" lineMode=\"CHAR\" font=\"{s}\">" ++
        "<hp:sz width=\"{d}\" widthRelTo=\"ABSOLUTE\" height=\"{d}\" heightRelTo=\"ABSOLUTE\" protect=\"0\"/>" ++
        "<hp:pos treatAsChar=\"1\" affectLSpacing=\"1\" flowWithText=\"1\" allowOverlap=\"0\" holdAnchorAndSO=\"0\" vertRelTo=\"PARA\" horzRelTo=\"PARA\" vertAlign=\"TOP\" horzAlign=\"LEFT\" vertOffset=\"0\" horzOffset=\"0\"/>" ++
        "<hp:outMargin left=\"0\" right=\"0\" top=\"0\" bottom=\"0\"/><hp:script>{s}</hp:script></hp:equation>", .{ object_id, version, request.base_line, request.base_unit, font, request.width, request.height, script });
    errdefer a.free(bytes);
    if (bytes.len > options.max_xml_bytes) return error.LimitExceeded;
    return bytes;
}

/// Input and request are borrowed, output independent. Every fallible operation
/// finishes before the caller can publish a new Session/history edge.
pub fn prepare(a: std.mem.Allocator, input: []const u8, request: Request, options: Options) !Prepared {
    if (input.len == 0 or input.len > options.max_input_bytes) return error.LimitExceeded;
    try inline_insert.verifySource(input, request.expected_source_sha256);
    try validate(a, request, options);
    var doc = try package.inspectDocument(a, input, .{});
    defer doc.deinit(a);
    try @import("file_transform_security.zig").validate(a, &doc, options.max_xml_bytes);
    var trees = try doc.readXmlTrees(a, .{
        .header = .{ .max_xml_bytes = options.max_xml_bytes },
        .section = .{ .max_xml_bytes = options.max_xml_bytes },
        .max_total_owned_xml_bytes = options.max_total_xml_bytes,
    });
    defer trees.deinit(a);
    if (request.target.section >= trees.sections.len) return error.InvalidSectionIndex;
    const ids = try inline_insert.nextPackageIds(a, &doc, 1, options.max_xml_bytes, options.max_total_xml_bytes);
    defer a.free(ids);
    // Scanner paragraph numbering is document-global. Accumulate in source order.
    var counters: @import("section_text.zig").Report = .{};
    var paragraph: ?usize = null;
    for (trees.sections) |*tree| {
        if (tree.section_ordinal == request.target.section) {
            paragraph = try inline_insert.locate(a, tree, request.target, &counters);
            break;
        }
        try @import("section_text.zig").scanSource(a, tree.source, tree.section_ordinal orelse return error.InvalidSectionIndex, tree.item_index, .{}, &counters, null);
    }
    const tree = &trees.sections[request.target.section];
    const object = try createXml(a, request, ids[0], options);
    defer a.free(object);
    const changed = try inline_insert.write(a, tree, paragraph orelse return error.InvalidParagraphIndex, request.target, object, options.max_xml_bytes);
    defer a.free(changed);
    const entry_index = doc.manifest.items[tree.item_index].entry_index orelse return error.MissingInsertPart;
    const bytes = try @import("../zip/replace_writer.zig").write(a, input, &.{.{ .entry_index = entry_index, .bytes = changed }}, .{ .max_output_bytes = options.max_output_bytes });
    errdefer a.free(bytes);
    const open_options: editor.Options = .{ .max_input_bytes = options.max_output_bytes, .max_output_bytes = options.max_output_bytes, .max_xml_bytes = options.max_xml_bytes };
    var reopened = try editor.open(a, bytes, open_options);
    defer reopened.deinit();
    const reopened_tree = &reopened.sections[request.target.section].tree;
    var inserted_node: ?usize = null;
    for (reopened_tree.elements, 0..) |element, index| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "equation")) continue;
        const raw = (try reopened_tree.attributeValue(a, index, "", "id")) orelse continue;
        const text = try raw.toUtf8(a, 4096);
        defer a.free(text);
        const id = @import("xml_values.zig").unsigned32(text) catch continue;
        if (id != ids[0]) continue;
        if (inserted_node != null) return error.InvalidEquationInsertionResult;
        inserted_node = index;
        const script = try @import("equation_script_write.zig").readValue(a, reopened_tree, index, .{ .max_script_bytes = options.max_script_bytes, .max_output_bytes = options.max_xml_bytes });
        defer a.free(script);
        if (!std.mem.eql(u8, script, request.script)) return error.InvalidEquationInsertionResult;
    }
    return .{ .bytes = bytes, .object_id = ids[0], .equation_node = inserted_node orelse return error.InvalidEquationInsertionResult };
}
