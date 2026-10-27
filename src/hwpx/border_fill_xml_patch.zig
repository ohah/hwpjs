//! 원본 BorderFill clone과 sparse 속성 변경. 표·글자·문단 선택 정책은 포함하지 않습니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const p = @import("../model/border_fill_patch.zig");
const profile_mod = @import("source_color_profile.zig");
const head = @import("document_xml.zig").head_uri;
const core = "http://www.hancom.co.kr/hwpml/2011/core";
const edge_names = [_][]const u8{ "leftBorder", "rightBorder", "topBorder", "bottomBorder" };
pub fn direct(tree: *const Tree, parent: usize, uri: []const u8, name: []const u8) !?usize {
    var found: ?usize = null;
    var cursor = tree.elements[parent].first_child;
    while (cursor) |index| : (cursor = tree.elements[index].next_sibling) if (tree.elements[index].is(uri, name)) {
        if (found != null) return error.DuplicateBorderFillChild;
        found = index;
    };
    return found;
}
pub fn attribute(a: std.mem.Allocator, tree: *const Tree, node: usize, name: []const u8, text: []const u8, limit: usize) ![]u8 {
    // text는 enum/숫자/검증 RGB만 상위에서 생성합니다. 임의 XML 문자열은 받지 않습니다.
    for (text) |c| if (c == '&' or c == '<' or c == '>' or c == '\'' or c == '"') return error.InvalidBorderFillAttribute;
    const raw = try tree.attributeValue(a, node, "", name);
    const replacement = if (raw) |v| try std.fmt.allocPrint(a, "{c}{s}{c}", .{ v.raw[0], text, v.raw[0] }) else try std.fmt.allocPrint(a, " {s}=\"{s}\"", .{ name, text });
    defer a.free(replacement);
    const start = if (raw) |v| @intFromPtr(v.raw.ptr) - @intFromPtr(tree.source.ptr) else tree.elements[node].start_tag.end - (if (tree.elements[node].end_tag == null) @as(usize, 2) else 1);
    return @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = start, .end = start + if (raw) |v| v.raw.len else @as(usize, 0), .text = "", .serialized_xml = replacement }}, limit);
}
fn readText(a: std.mem.Allocator, tree: *const Tree, node: usize, name: []const u8) !?[]u8 {
    return if (try tree.attributeValue(a, node, "", name)) |v| try v.toUtf8(a, 4096) else null;
}
fn readUnsigned(a: std.mem.Allocator, tree: *const Tree, node: usize, name: []const u8) !?u32 {
    const value = (try readText(a, tree, node, name)) orelse return null;
    defer a.free(value);
    return @import("xml_values.zig").unsigned32(value) catch null;
}
fn readColor(a: std.mem.Allocator, tree: *const Tree, node: usize, name: []const u8, profile: profile_mod.Profile, field: profile_mod.Field) !?u32 {
    const value = (try readText(a, tree, node, name)) orelse return null;
    defer a.free(value);
    return profile_mod.decode(profile, field, value);
}
fn readWidth(a: std.mem.Allocator, raw: []const u8) !?u16 {
    _ = a;
    if (!std.mem.endsWith(u8, raw, " mm")) return null;
    const number = raw[0 .. raw.len - 3];
    if (number.len == 0) return null;
    var whole: u32 = 0;
    var fraction: u32 = 0;
    var digits: usize = 0;
    var dot = false;
    var whole_digits: usize = 0;
    for (number) |c| {
        if (c == '.') {
            if (dot or whole_digits == 0) return null;
            dot = true;
            continue;
        }
        if (c < '0' or c > '9') return null;
        if (!dot) {
            whole = std.math.mul(u32, whole, 10) catch return null;
            whole = std.math.add(u32, whole, c - '0') catch return null;
            whole_digits += 1;
        } else {
            if (digits < 2) fraction = fraction * 10 + c - '0' else if (c != '0') return null;
            digits += 1;
        }
    }
    if (whole_digits == 0 or (dot and digits == 0)) return null;
    if (digits == 1) fraction *= 10;
    const scaled = std.math.add(u32, std.math.mul(u32, whole, 100) catch return null, fraction) catch return null;
    for (p.widths) |value| if (scaled == value) return value;
    return null;
}
pub fn observe(a: std.mem.Allocator, tree: *const Tree, node: usize, profile: profile_mod.Profile) !p.Value {
    return observeSelected(a, tree, node, profile, @splat(true), true);
}
pub fn observeSelected(a: std.mem.Allocator, tree: *const Tree, node: usize, profile: profile_mod.Profile, mask: [4]bool, background: bool) !p.Value {
    if (!tree.elements[node].is(head, "borderFill")) return error.InvalidBorderFillElement;
    var out: p.Value = .{};
    for (edge_names, 0..) |name, i| {
        if (!mask[i]) continue;
        if (try direct(tree, node, head, name)) |edge| {
            if (try readText(a, tree, edge, "type")) |token| {
                defer a.free(token);
                out.edges[i].style = std.meta.stringToEnum(p.Style, token);
            }
            if (try readText(a, tree, edge, "width")) |token| {
                defer a.free(token);
                out.edges[i].width_hundredth_mm = try readWidth(a, token);
            }
            out.edges[i].color = try readColor(a, tree, edge, "color", profile, .other);
        }
    }
    if (!background) return out;
    const brush = (try direct(tree, node, core, "fillBrush")) orelse {
        out.background = .none;
        return out;
    };
    var counts: usize = 0;
    var child = tree.elements[brush].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        counts += 1;
    }
    if (counts == 0) {
        out.background = .none;
        return out;
    }
    if (counts != 1) return out;
    if (try direct(tree, brush, core, "winBrush")) |win| {
        const face = (try readColor(a, tree, win, "faceColor", profile, .win_brush_face_color)) orelse return out;
        const style = try readText(a, tree, win, "hatchStyle");
        defer if (style) |v| a.free(v);
        if (style == null) {
            out.background = .{ .solid = .{ .color = face, .hatch_color = try readColor(a, tree, win, "hatchColor", profile, .win_brush_hatch_color) } };
            return out;
        }
        const hatch = std.meta.stringToEnum(p.Hatch, style.?) orelse return out;
        const hatch_color = (try readColor(a, tree, win, "hatchColor", profile, .win_brush_hatch_color)) orelse return out;
        out.background = .{ .hatch = .{ .face = face, .hatch = hatch_color, .style = hatch } };
        return out;
    }
    if (try direct(tree, brush, core, "gradation")) |grad| {
        const kind = (try readText(a, tree, grad, "type")) orelse return out;
        defer a.free(kind);
        if (!std.mem.eql(u8, kind, "LINEAR")) return out;
        const angle = (try readUnsigned(a, tree, grad, "angle")) orelse return out;
        const x = (try readUnsigned(a, tree, grad, "centerX")) orelse return out;
        const y = (try readUnsigned(a, tree, grad, "centerY")) orelse return out;
        const step = (try readUnsigned(a, tree, grad, "step")) orelse return out;
        const center = (try readUnsigned(a, tree, grad, "stepCenter")) orelse return out;
        if (angle >= 360 or x > 100 or y > 100 or step > 100 or center > 100) return out;
        if (try readUnsigned(a, tree, grad, "colorNum") != 2) return out;
        var colors: [2]u32 = undefined;
        var count: usize = 0;
        child = tree.elements[grad].first_child;
        while (child) |index| : (child = tree.elements[index].next_sibling) {
            if (!tree.elements[index].is(core, "color") or count >= 2) return out;
            colors[count] = (try readColor(a, tree, index, "value", profile, .gradation_color_value)) orelse return out;
            count += 1;
        }
        if (count != 2) return out;
        out.background = .{ .linear = .{ .colors = colors, .angle = @intCast(angle), .center_x = @intCast(x), .center_y = @intCast(y), .step = @intCast(step), .step_center = @intCast(center) } };
    }
    return out;
}
fn parse(a: std.mem.Allocator, bytes: []const u8, tree: *const Tree, limit: usize) !Tree {
    return @import("xml_part_tree.zig").parse(a, bytes, .header, null, tree.item_index, .{ .max_xml_bytes = limit });
}
fn rawBackgroundXml(a: std.mem.Allocator, b: p.Background, profile: profile_mod.Profile) ![]u8 {
    switch (b) {
        .none => return a.dupe(u8, ""),
        .solid => |v| {
            const face = try profile_mod.encode(a, profile, .win_brush_face_color, v.color);
            defer a.free(face);
            return std.fmt.allocPrint(a, "<fillBrush xmlns=\"{s}\"><winBrush faceColor=\"{s}\"/></fillBrush>", .{ core, face });
        },
        .hatch => |v| {
            const face = try profile_mod.encode(a, profile, .win_brush_face_color, v.face);
            defer a.free(face);
            const hatch = try profile_mod.encode(a, profile, .win_brush_hatch_color, v.hatch);
            defer a.free(hatch);
            return std.fmt.allocPrint(a, "<fillBrush xmlns=\"{s}\"><winBrush faceColor=\"{s}\" hatchColor=\"{s}\" hatchStyle=\"{s}\"/></fillBrush>", .{ core, face, hatch, @tagName(v.style) });
        },
        .linear => |g| {
            const c0 = try profile_mod.encode(a, profile, .gradation_color_value, g.colors[0]);
            defer a.free(c0);
            const c1 = try profile_mod.encode(a, profile, .gradation_color_value, g.colors[1]);
            defer a.free(c1);
            return std.fmt.allocPrint(a, "<fillBrush xmlns=\"{s}\"><gradation type=\"LINEAR\" angle=\"{d}\" centerX=\"{d}\" centerY=\"{d}\" step=\"{d}\" stepCenter=\"{d}\" colorNum=\"2\"><color value=\"{s}\"/><color value=\"{s}\"/></gradation></fillBrush>", .{ core, g.angle, g.center_x, g.center_y, g.step, g.step_center, c0, c1 });
        },
    }
}
fn backgroundXml(a: std.mem.Allocator, b: p.Background, profile: profile_mod.Profile, alpha: ?[]const u8, old_hatch: ?[]const u8) ![]u8 {
    var raw = try rawBackgroundXml(a, b, profile);
    errdefer a.free(raw);
    if (b == .solid) {
        const hatch: ?[]u8 = if (b.solid.hatch_color) |color| blk: {
            const token = try profile_mod.encode(a, profile, .win_brush_hatch_color, color);
            defer a.free(token);
            break :blk try std.fmt.allocPrint(a, "\"{s}\"", .{token});
        } else null;
        defer if (hatch) |value| a.free(value);
        const retained = if (hatch) |value| value else old_hatch;
        if (retained) |value| {
            const marker = "<winBrush ";
            const offset = (std.mem.indexOf(u8, raw, marker) orelse return error.MissingBackgroundChild) + marker.len;
            const next = try std.fmt.allocPrint(a, "{s}hatchColor={s} {s}", .{ raw[0..offset], value, raw[offset..] });
            a.free(raw);
            raw = next;
        }
    }
    if (alpha == null or b == .none) return raw;
    const marker = if (b == .linear) "<gradation " else "<winBrush ";
    const offset = (std.mem.indexOf(u8, raw, marker) orelse return error.MissingBackgroundChild) + marker.len;
    const result = try std.fmt.allocPrint(a, "{s}alpha={s} {s}", .{ raw[0..offset], alpha.?, raw[offset..] });
    a.free(raw);
    return result;
}

pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, patch: p.Patch, limit: usize, profile: profile_mod.Profile) ![]u8 {
    try p.validate(patch);
    if (tree.part_kind != .header or node >= tree.elements.len or !tree.elements[node].is(head, "borderFill")) return error.InvalidBorderFillElement;
    var current = try a.dupe(u8, tree.source);
    defer a.free(current);
    for (patch.border.edges, 0..) |e, i| if (e) |edge| {
        inline for (.{ "style", "width_hundredth_mm", "color" }) |field| if (@field(edge, field)) |value| {
            var parsed = try parse(a, current, tree, limit);
            defer parsed.deinit(a);
            const child = (try direct(&parsed, node, head, edge_names[i])) orelse return error.MissingBorderFillEdge;
            const rendered = if (comptime std.mem.eql(u8, field, "style")) try a.dupe(u8, @tagName(value)) else if (comptime std.mem.eql(u8, field, "color")) try @import("../model/rgb_color.zig").format(a, value) else try std.fmt.allocPrint(a, "{d}.{d:0>2} mm", .{ value / 100, value % 100 });
            defer a.free(rendered);
            const name = if (comptime std.mem.eql(u8, field, "style")) "type" else if (comptime std.mem.eql(u8, field, "color")) "color" else "width";
            const next = try attribute(a, &parsed, child, name, rendered, limit);
            a.free(current);
            current = next;
        };
    };
    if (patch.background) |background| {
        var parsed = try parse(a, current, tree, limit);
        defer parsed.deinit(a);
        const child = try direct(&parsed, node, core, "fillBrush");
        var alpha: ?[]u8 = null;
        defer if (alpha) |raw| a.free(raw);
        var old_hatch: ?[]u8 = null;
        defer if (old_hatch) |raw| a.free(raw);
        if (child) |brush| {
            const original = parsed.sourceOf(brush);
            if (std.mem.indexOf(u8, original, "<!--") != null or std.mem.indexOf(u8, original, "<?") != null) return error.UnsupportedBackgroundExtension;
            // 미해석 alpha/확장을 지우지 않으며 정확히 해석한 원본만 교체합니다.
            const input = try @import("xml_part_attributes.zig").parseStartTag(a, &parsed, brush);
            var owned = input;
            defer owned.deinit(a);
            for (owned.attributes) |attr| if (!try @import("../xml/root.zig").namespaces.isDeclaration(attr.name)) return error.UnsupportedBackgroundExtension;
            var cursor = parsed.elements[brush].first_child;
            while (cursor) |index| : (cursor = parsed.elements[index].next_sibling) {
                if (!parsed.elements[index].is(core, "winBrush") and !parsed.elements[index].is(core, "gradation")) return error.UnsupportedOpaqueBackground;
                if (parsed.elements[index].is(core, "winBrush")) if (try parsed.attributeValue(a, index, "", "hatchColor")) |raw| {
                    if (old_hatch != null) return error.UnsupportedBackgroundCombination;
                    old_hatch = try a.dupe(u8, raw.raw);
                };
                if (try parsed.attributeValue(a, index, "", "alpha")) |raw| {
                    if (alpha != null) return error.UnsupportedBackgroundAlphaCombination;
                    const decoded = try raw.toUtf8(a, 4096);
                    defer a.free(decoded);
                    try @import("xml_values.zig").floatLexical(decoded);
                    alpha = try a.dupe(u8, raw.raw);
                }
                if (parsed.elements[index].is(core, "gradation")) {
                    const kind = (try readText(a, &parsed, index, "type")) orelse return error.UnsupportedBackgroundGradient;
                    defer a.free(kind);
                    if (!std.mem.eql(u8, kind, "LINEAR")) return error.UnsupportedBackgroundGradient;
                }
                // 다른 미지 속성은 기존 reader 진단으로 탐지합니다.
            }
            var report = try @import("fill_brush.zig").inspectBrush(a, &parsed, brush, .{});
            defer report.deinit(a);
            if (report.unknown_enums != 0) return error.UnsupportedBackgroundKind;
            for (report.brushes) |b| if (b.element_index == brush and b.other_attributes != 0) return error.UnsupportedBackgroundExtension;
            for (report.nodes) |n| {
                if (n.other_attributes != 0 or n.direct_children != n.recognized_children) return error.UnsupportedBackgroundExtension;
            }
        }
        const replacement = try backgroundXml(a, background, profile, alpha, old_hatch);
        defer a.free(replacement);
        const ending = parsed.elements[node].end_tag orelse return error.MissingBorderFillEndTag;
        const start = if (child) |index| parsed.elements[index].start_tag.start else ending.start;
        const end = if (child) |index| parsed.elements[index].end else start;
        const next = try @import("xml_source_writer.zig").write(a, current, &.{.{ .start = start, .end = end, .text = "", .serialized_xml = replacement }}, limit);
        a.free(current);
        current = next;
    }
    var parsed = try parse(a, current, tree, limit);
    defer parsed.deinit(a);
    return a.dupe(u8, parsed.sourceOf(node));
}
