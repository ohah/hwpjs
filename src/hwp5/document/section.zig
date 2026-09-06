const std = @import("std");
const types = @import("types.zig");
const Tree = @import("../body/tree.zig").Tree;
const paragraphs = @import("../body/paragraphs.zig");
const definitions = @import("../body/section_validation.zig");
const Links = @import("../body/control_links.zig").Links;
const control_types = @import("../body/control_type_validation.zig");
const Groups = @import("../body/list_groups.zig").Groups;
const tables = @import("../body/table_validation.zig");
const sources = @import("../parameters/sources.zig");
const object = @import("../body/object_common.zig");
pub fn inspect(a: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, counts: @import("../docinfo/resources.zig").Report, options: types.Options) !types.SectionReport {
    var tree = try Tree.parse(a, bytes, version, options.framing);
    defer tree.deinit(a);
    const paras = try paragraphs.inspect(tree, .{ .char_shapes = counts.count(.char_shape), .para_shapes = counts.count(.para_shape), .styles = counts.count(.style) });
    const definition = try definitions.inspect(tree, version, counts.count(.numbering), counts.count(.border_fill));
    var links = try Links.build(a, tree);
    defer links.deinit(a);
    const controls = try control_types.inspect(links.items);
    var groups = try Groups.build(a, tree);
    defer groups.deinit(a);
    const header_footer = try @import("../body/header_footer_validation.zig").inspect(tree, groups.items, options.list_layout);
    const number_controls = try @import("../body/number_control_validation.zig").inspect(tree);
    const page_number = try @import("../body/page_number_validation.zig").inspect(tree);
    const index_marks = try @import("../body/index_mark_validation.zig").inspect(tree);
    const page_visibility = try @import("../body/page_visibility_validation.zig").inspect(tree, options.hide_layout);
    var lists: types.Lists = .{ .groups = groups.items.len };
    for (groups.items) |g| {
        lists.paragraphs += g.paragraph_count;
        lists.intervening_records += g.intervening_records;
    }
    var objects: usize = 0;
    for (tree.nodes) |node| {
        if (node.record.value != .control_header) continue;
        const h = node.record.value.control_header;
        if (!object.supports(h.id)) continue;
        _ = try object.Properties.parse(h.properties);
        objects += 1;
    }
    const parameter_report = try sources.inspectBodyDetailed(a, tree, types.parameterOptions(options, counts.bin_data_count));
    const char_overlap = try @import("../body/char_overlap_validation.zig").inspect(tree, options.overlap_layout, counts.count(.char_shape));
    const shapes = try @import("../body/shape_validation.zig").inspectDetailed(tree, options.drawing_style, counts.bin_data_count);
    return .{
        .shapes = shapes.shapes,
        .drawing_styles = shapes.styles,
        .lines = try @import("../body/line_validation.zig").inspect(tree),
        .rectangles = try @import("../body/rectangle_validation.zig").inspect(tree, options.rectangle_layout),
        .ellipses = try @import("../body/ellipse_validation.zig").inspect(tree),
        .arcs = try @import("../body/arc_validation.zig").inspect(tree, options.arc_layout),
        .polygons = try @import("../body/polygon_validation.zig").inspect(tree, options.polygon_layout),
        .curves = try @import("../body/curve_validation.zig").inspect(tree, options.curve_layout),
        .pictures = try @import("../body/picture_validation.zig").inspect(tree, options.picture, counts.bin_data_count),
        .ole = try @import("../body/ole_validation.zig").inspect(tree, options.ole_layout),
        .equations = try @import("../body/equation_validation.zig").inspect(tree, options.equation_layout),
        .notes = try @import("../body/note_validation.zig").inspect(tree, groups.items, options.note_layout, options.list_layout),
        .hidden_comments = try @import("../body/hidden_comment.zig").inspect(tree, groups.items, options.list_layout),
        .ruby = try @import("../body/ruby_validation.zig").inspect(tree),
        .fields = try @import("../body/field_validation.zig").inspect(tree),
        .observed_field_links = links.observedCount(),
        .char_overlap = char_overlap,
        .bookmarks = parameter_report.bookmarks,
        .page_visibility = page_visibility,
        .index_marks = index_marks,
        .page_number = page_number,
        .number_controls = number_controls,
        .header_footer = header_footer,
        .records = tree.nodes.len,
        .paragraphs = paras,
        .definition = definition,
        .control_types = controls,
        .lists = lists,
        .tables = try tables.inspect(a, tree, .{ .list_layout = options.list_layout, .zone_layout = options.zone_layout, .border_count = counts.count(.border_fill) }),
        .parameters = parameter_report.parameters,
        .object_properties = objects,
    };
}
