//! Strict inline modern chart display-frame resize. Intrinsic OLE/presentation bytes stay exact.
//! Unverified transforms, cached flow and presentation layouts remain refused.
const std = @import("std");
const t = @import("../../model/object_geometry.zig");
const Version = @import("../version.zig").Version;
const Section = @import("../../model/document.zig").Section;
const Source = @import("../text_source.zig").Source;
const component = @import("../body/shape_component.zig");
const affine = @import("../../geometry/affine_row.zig");
const Site = @import("../chart/ole_sites.zig").Site;
const Bound = struct { site: Site, physical_id: u16, resource_sha256: [32]u8, ticket: @import("../../model/history_mutation_epoch.zig").Ticket, protected: bool };
fn noLineCache(a: std.mem.Allocator, decoded: []const []u8, version: Version) !void {
    for (decoded) |bytes| {
        var tree = try @import("source_tree.zig").parse(a, bytes, version, .{});
        defer tree.deinit(a);
        for (tree.nodes) |node| {
            if (node.record.value == .line_segments or (node.record.value == .header and node.record.value.header.line_segment_count != 0)) return error.Hwp5ChartGeometryLineCacheUnproved;
        }
    }
}
pub fn validatePresentation(a: std.mem.Allocator, bytes: []const u8) !void {
    var ole = try @import("../../ole/container.zig").open(a, bytes, .observed_size_prefix, .{ .strict = true, .max_input_bytes = 32 * 1024 * 1024, .max_stream_bytes = 16 * 1024 * 1024, .max_total_stream_bytes = 32 * 1024 * 1024 });
    defer ole.deinit();
    var streams: usize = 0;
    for (ole.entries) |entry| {
        if (entry.kind == 0 or entry.kind == 5) continue;
        if (entry.parent != 0 or entry.kind != 2) return error.UnsupportedHwp5ChartGeometryPresentation;
        if (!std.mem.eql(u8, entry.name, "OOXMLChartContents") and !std.mem.eql(u8, entry.name, "\x02OlePres000")) return error.UnsupportedHwp5ChartGeometryPresentation;
        streams += 1;
    }
    if (streams != 2) return error.UnsupportedHwp5ChartGeometryPresentation;
    const index = try ole.findExact("/\x02OlePres000") orelse return error.UnsupportedHwp5ChartGeometryPresentation;
    const bytes_png = ole.entries[index].content;
    if (bytes_png.len < 40) return error.UnsupportedHwp5ChartGeometryPresentation;
    const png = bytes_png[40..];
    const report = try @import("../../image/png/structure.zig").inspect(png, .{ .max_pixels = 4 * 1024 * 1024 });
    // Width/height here are the registered PNG's intrinsic pixel dimensions,
    // not the HWPUNIT display frame. Verify and retain them without conversion.
    try @import("../chart/create_png_presentation.zig").verify(bytes_png, png, report.header.width, report.header.height);
}
fn proof(a: std.mem.Allocator, session: anytype, source: *const Source, pending_resources: bool, raw: []const u8, decoded: []const []u8, version: Version, part: Section, selector: t.Selector) !Bound {
    if (selector.kind != .chart) return error.InvalidObjectGeometryTarget;
    const rows = try session.hwp5ChartCandidates(a);
    defer a.free(rows);
    var chosen: ?@import("../chart/candidate_snapshot.zig").Candidate = null;
    for (rows) |row| {
        if (row.section != selector.section or row.owner.component_node != selector.node) continue;
        if (chosen != null) return error.AmbiguousObjectGeometryOwner;
        if (row.resource.state != .modern_chart or row.resource.physical_id == null or row.resource.resource_sha256 == null) return error.UnsupportedHwp5ChartGeometryOwner;
        chosen = row;
    }
    const row = chosen orelse return error.InvalidObjectGeometryTarget;
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(raw, &digest, .{});
    if (!std.mem.eql(u8, &digest, &row.owner.section_source_sha256)) return error.StaleObjectGeometryOwner;
    if (row.owner.paragraph >= part.paragraphs.len or part.paragraphs[row.owner.paragraph].parent_node != null) return error.UnsupportedHwp5ChartGeometryHost;
    var current = try session.hwp5ChartDisplay(a, selector.section, row.owner.control_node);
    defer current.deinit(a);
    if (!std.meta.eql(current.owner, row.owner) or current.physical_id != row.resource.physical_id or !std.mem.eql(u8, &current.resource_sha256, &row.resource.resource_sha256.?)) return error.StaleObjectGeometryOwner;
    if (current.legacy_backup_present or current.presentation_streams != 1) return error.UnsupportedHwp5ChartGeometryPresentation;
    var view = try @import("../chart/created_resource_read.zig").prepare(a, session, pending_resources);
    defer view.deinit(a);
    var index = try @import("binary_resource_index.zig").Index.init(a, view.get(source));
    defer index.deinit(a);
    const resource = try index.read(a, row.owner.ordinal, 32 * 1024 * 1024);
    defer a.free(resource);
    std.crypto.hash.sha2.Sha256.hash(resource, &digest, .{});
    if (!std.mem.eql(u8, &digest, &current.resource_sha256) or try index.physicalId(row.owner.ordinal) != row.resource.physical_id.?) return error.StaleObjectGeometryOwner;
    try validatePresentation(a, resource);
    try noLineCache(a, decoded, version);
    var protection = try @import("text_source_protection.zig").read(a, decoded, version, selector.section, part);
    defer protection.deinit(a);
    if (row.owner.paragraph >= protection.protected_paragraphs.len) return error.SourceBindingMismatch;
    return .{ .site = row.owner, .physical_id = row.resource.physical_id.?, .resource_sha256 = current.resource_sha256, .ticket = try session.historyTicket(), .protected = protection.protected_paragraphs[row.owner.paragraph] };
}
pub fn checkedShape(tree: @import("../body/tree.zig").Tree, site: Site) !component.Component {
    if (site.ole_layout != .spec24 or site.attributes != 1 or site.opaque_tail_bytes != 0 or site.extent_x <= 0 or site.extent_y <= 0) return error.UnsupportedHwp5ChartGeometryProfile;
    if (tree.nodes[site.component_node].parent != site.control_node) return error.UnsupportedHwp5ChartGeometryHost;
    const shape = try component.Component.parse(tree.nodes[site.component_node].record.framing.payload, .double_id);
    if (shape.extra.len != 0) return error.UnsupportedHwp5ChartGeometryProfile;
    if (shape.current_width == 0 or shape.current_height == 0 or shape.original_width != @as(u32, @intCast(site.extent_x)) or shape.original_height != @as(u32, @intCast(site.extent_y)) or shape.current_width != site.geometry.width or shape.current_height != site.geometry.height) return error.UnsupportedHwp5ChartGeometryExtent;
    const common = try @import("../body/object_common.zig").parseControl(tree.nodes[site.control_node].record.value.control_header);
    if (!@import("../body/object_common.zig").hasAbsoluteDimensions(common.flags) or common.flags & 1 == 0 or common.hasCaption() or common.extra.len != 0) return error.UnsupportedHwp5ChartGeometryHost;
    if (shape.group_count != 0 or shape.rotation_angle != 0 or shape.attributes != 0 or shape.horizontalFlip() or shape.verticalFlip() or shape.offset_x != 0 or shape.offset_y != 0 or shape.rendering.pairs.count() != 1) return error.UnsupportedObjectGeometryTransform;
    const identity: affine.Matrix = .{ 1, 0, 0, 0, 1, 0 };
    for (shape.rendering.translation.bits, identity) |bits, expected| if (@as(f64, @bitCast(bits)) != expected) return error.UnsupportedObjectGeometryTransform;
    for (shape.rendering.pairs.get(0).?.rotation.bits, identity) |bits, expected| if (@as(f64, @bitCast(bits)) != expected) return error.UnsupportedObjectGeometryTransform;
    const matrix = try @import("../body/rendering_affine.zig").compose(shape.rendering);
    if (matrix[0] <= 0 or matrix[4] <= 0 or matrix[1] != 0 or matrix[2] != 0 or matrix[3] != 0 or matrix[5] != 0) return error.UnsupportedObjectGeometryTransform;
    const extents = [2]f64{ matrix[0] * @as(f64, @floatFromInt(shape.original_width)), matrix[4] * @as(f64, @floatFromInt(shape.original_height)) };
    for (extents, [2]u32{ shape.current_width, shape.current_height }) |computed, current| if (!std.math.isFinite(computed) or @abs(computed - @as(f64, @floatFromInt(current))) > 0.000001) return error.UnsupportedHwp5ChartGeometryExtent;
    return shape;
}
pub fn observe(a: std.mem.Allocator, session: anytype, source: *const Source, pending_resources: bool, raw: []const u8, decoded: []const []u8, version: Version, part: Section, selector: t.Selector, revision: u64, binding: t.Binding, read_only: bool) !t.Observation {
    const bound = try proof(a, session, source, pending_resources, raw, decoded, version, part, selector);
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    _ = try checkedShape(tree, bound.site);
    const common = try @import("../body/object_common.zig").parseControl(tree.nodes[bound.site.control_node].record.value.control_header);
    const denied = read_only or bound.protected;
    const link = try std.fmt.allocPrint(a, "chart:{d}:ole:{d}:bin:{d}:{s}:doc:{d}:gen:{d}:owner:{d}:epoch:{d}", .{ bound.site.component_node, bound.site.ole_node, bound.physical_id, std.fmt.bytesToHex(bound.resource_sha256, .lower), bound.ticket.binding.document, bound.ticket.binding.generation, bound.ticket.binding.owner, bound.ticket.epoch });
    errdefer a.free(link);
    const session_binding = try a.dupe(u8, binding.session);
    errdefer a.free(session_binding);
    return .{ .format = .hwp5, .selector = selector, .frame = .{ .width = common.width, .height = common.height, .horizontalOffset = bound.site.geometry.offset_x, .verticalOffset = bound.site.geometry.offset_y, .treatAsCharacter = true }, .owner = .{ .ownerNode = @intCast(bound.site.control_node), .componentNode = @intCast(bound.site.component_node), .paragraph = @intCast(bound.site.paragraph), .anchorUnit = bound.site.current_unit, .sourceSha256 = bound.site.section_source_sha256, .link = link }, .editable = .{ .size = !denied and !common.sizeProtected(), .position = false }, .reason = if (denied) "ObjectGeometryReadOnly" else if (common.sizeProtected()) "ObjectGeometrySizeProtected" else null, .historyRevision = revision, .binding = .{ .session = session_binding, .serial = try a.dupe(u8, binding.serial) } };
}
pub fn write(a: std.mem.Allocator, session: anytype, source: *const Source, pending_resources: bool, raw: []const u8, decoded: []const []u8, version: Version, part: Section, request: t.Request, read_only: bool) !?[]u8 {
    var current = try observe(a, session, source, pending_resources, raw, decoded, version, part, request.selector, request.historyRevision, request.binding, read_only);
    defer current.deinit(a);
    if (!std.meta.eql(current.frame, request.expected) or current.owner.ownerNode != request.owner.ownerNode or current.owner.componentNode != request.owner.componentNode or current.owner.paragraph != request.owner.paragraph or current.owner.anchorUnit != request.owner.anchorUnit or !std.mem.eql(u8, &current.owner.sourceSha256, &request.owner.sourceSha256) or !std.mem.eql(u8, current.owner.link, request.owner.link)) return error.StaleObjectGeometryOwner;
    if (!current.editable.size or request.patch.horizontalOffset != null or request.patch.verticalOffset != null or request.patch.treatAsCharacter != null) return error.ObjectGeometryReadOnly;
    const after = try t.after(current.frame, request.patch);
    if (std.meta.eql(after, current.frame)) return null;
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    const control = tree.nodes[current.owner.ownerNode].record.framing;
    const shape_record = tree.nodes[request.selector.node].record.framing;
    const shape = try component.Component.parse(shape_record.payload, .double_id);
    const matrix = try @import("../body/rendering_affine.zig").compose(shape.rendering);
    var scaled = try @import("../../geometry/resize_axes.zig").resize(matrix, .{ 0, 0 }, .{ matrix[0] * @as(f64, @floatFromInt(shape.original_width)), matrix[4] * @as(f64, @floatFromInt(shape.original_height)) }, .{ after.width, after.height });
    // The profile has exactly one diagonal scale and identity translation/rotation.
    // A one-axis edit must not normalize the other axis or zero coefficient bits.
    const original_scale = shape.rendering.pairs.get(0).?.scale.bits;
    for ([_]usize{ 1, 2, 3, 5 }) |axis| scaled[axis] = @bitCast(original_scale[axis]);
    if (after.width == current.frame.width) scaled[0] = @bitCast(original_scale[0]);
    if (after.height == current.frame.height) scaled[4] = @bitCast(original_scale[4]);
    const computed = [2]f64{ scaled[0] * @as(f64, @floatFromInt(shape.original_width)), scaled[4] * @as(f64, @floatFromInt(shape.original_height)) };
    for (computed, [2]u32{ after.width, after.height }) |axis, target| if (!std.math.isFinite(axis) or @abs(axis - @as(f64, @floatFromInt(target))) > 0.000001) return error.UnsupportedHwp5ChartGeometryExtent;
    const common_payload = try @import("object_size_payload.zig").write(a, control.payload, .{ after.width, after.height }, control.payload.len);
    defer a.free(common_payload);
    const sized = try @import("drawing_current_size_payload.zig").write(a, shape_record.payload, .double_id, .{ .width = after.width, .height = after.height }, shape_record.payload.len);
    defer a.free(sized);
    const resized = try @import("drawing_matrix_payload.zig").write(a, sized, .double_id, .{ .scale = 0 }, scaled, sized.len);
    defer a.free(resized);
    if (common_payload.len != control.payload.len or resized.len != shape_record.payload.len) return error.SourceBindingMismatch;
    const output = try a.dupe(u8, raw);
    errdefer a.free(output);
    const common_offset = control.offset + control.raw.len - control.payload.len;
    const shape_offset = shape_record.offset + shape_record.raw.len - shape_record.payload.len;
    @memcpy(output[common_offset..][0..common_payload.len], common_payload);
    @memcpy(output[shape_offset..][0..resized.len], resized);
    return output;
}
