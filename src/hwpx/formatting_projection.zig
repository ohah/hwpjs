//! Fresh source/intents projection. No saved ZIP or second editing Session.
const std = @import("std");
const p = @import("../model/formatting_projection.zig");
const m = @import("../model/formatting_patch.zig");
const common = @import("../model/formatting_source_values.zig");
const Session = @import("editor_session.zig").Session;
pub const Backend = struct {
    session: *Session,
    allocator: std.mem.Allocator,
    snapshot: ?*Snapshot = null,
    pub const Snapshot = struct {
        allocator: std.mem.Allocator,
        characters: ?[]@import("character_shape_display.zig").Shape = null,
        paragraphs: ?[]@import("paragraph_display_owned.zig").Shape = null,
        faces: ?[]@import("../model/font_face_value.zig").Value = null,
        underlines: ?[]@import("character_underline_snapshot.zig").FullRow = null,
        metrics: ?[]@import("character_font_metrics.zig").Row = null,
        strikes: ?[]@import("character_strike_styles.zig").Row = null,
        preflight_context: ?@import("formatting_preflight.zig").Context = null,
        pub fn deinit(self: *Snapshot) void {
            if (self.underlines) |rows| @import("character_underline_snapshot.zig").deinit(self.allocator, rows);
            if (self.metrics) |rows| self.allocator.free(rows);
            if (self.strikes) |rows| @import("character_strike_styles.zig").deinit(self.allocator, rows);
            if (self.preflight_context) |*context| context.deinit();
            if (self.characters) |rows| self.allocator.free(rows);
            if (self.paragraphs) |rows| @import("paragraph_display_resources.zig").deinit(self.allocator, rows);
            if (self.faces) |rows| @import("font_face_snapshot.zig").deinit(self.allocator, rows);
            self.* = .{ .allocator = self.allocator };
        }
    };
    fn readCharacters(self: Backend, a: std.mem.Allocator) ![]@import("character_shape_display.zig").Shape {
        _ = a;
        if (self.snapshot) |snapshot| {
            if (snapshot.characters) |rows| return rows;
            const rows = try @import("character_style_resources.zig").displayShapes(self.session);
            snapshot.characters = rows;
            return rows;
        }
        return @import("character_style_resources.zig").displayShapes(self.session);
    }
    fn readParagraphs(self: Backend, a: std.mem.Allocator) ![]@import("paragraph_display_owned.zig").Shape {
        _ = a;
        if (self.snapshot) |snapshot| {
            if (snapshot.paragraphs) |rows| return rows;
            const rows = try self.session.paragraphShapes();
            snapshot.paragraphs = rows;
            return rows;
        }
        return self.session.paragraphShapes();
    }
    fn readFaces(self: Backend, a: std.mem.Allocator) ![]@import("../model/font_face_value.zig").Value {
        _ = a;
        if (self.snapshot) |snapshot| {
            if (snapshot.faces) |rows| return rows;
            const rows = try @import("font_creation.zig").list(self.session);
            snapshot.faces = rows;
            return rows;
        }
        return @import("font_creation.zig").list(self.session);
    }
    fn readUnderlines(self: Backend) ![]@import("character_underline_snapshot.zig").FullRow {
        if (self.snapshot) |snapshot| {
            if (snapshot.underlines) |rows| return rows;
            const rows = try @import("character_underline_snapshot.zig").readFull(self.session);
            snapshot.underlines = rows;
            return rows;
        }
        return @import("character_underline_snapshot.zig").readFull(self.session);
    }
    fn readMetrics(self: Backend) ![]@import("character_font_metrics.zig").Row {
        if (self.snapshot) |snapshot| {
            if (snapshot.metrics) |rows| return rows;
            const rows = try @import("character_font_metrics.zig").list(self.session);
            snapshot.metrics = rows;
            return rows;
        }
        return @import("character_font_metrics.zig").list(self.session);
    }
    fn readStrikes(self: Backend) ![]@import("character_strike_styles.zig").Row {
        if (self.snapshot) |snapshot| {
            if (snapshot.strikes) |rows| return rows;
            const rows = try @import("character_strike_styles.zig").read(self.session);
            snapshot.strikes = rows;
            return rows;
        }
        return @import("character_strike_styles.zig").read(self.session);
    }
    pub fn resetResources(self: Backend, selected: m.Owner, a: std.mem.Allocator) !m.ResetResources {
        _ = try self.owner(selected);
        var local: ?@import("formatting_preflight.zig").Context = null;
        defer if (local) |*value| value.deinit();
        const context = try self.currentContext(a, &local);
        return @import("formatting_style_reset.zig").readWithContext(a, self.session, selected, context);
    }
    pub fn owner(self: Backend, value: m.Owner) !m.Owner {
        if (value.section >= self.session.sections.len) return error.InvalidSectionIndex;
        const section = &self.session.sections[value.section];
        if (value.paragraph < section.first_paragraph or value.paragraph > section.last_paragraph) return error.InvalidParagraphIndex;
        var view = try @import("display_current_paragraphs.zig").read(self.allocator, section, self.session.options);
        defer view.deinit(self.allocator);
        const index = value.paragraph - section.first_paragraph;
        if (index >= view.paragraphs.len or view.paragraphs[index].source_ordinal == null) return error.UnsupportedFormattingOwner;
        return value;
    }
    pub fn authorize(self: Backend, selected: m.Owner, ranges: []const m.Range, field: []const u8) !void {
        try self.authorizeOwner(selected);
        try self.authorizeField(self.allocator, selected, field);
        if (std.mem.startsWith(u8, field, "character.")) {
            if (ranges.len == 0) return error.CharacterRangeRequired;
            for (ranges) |range| try self.validateRange(selected, range);
        }
        // Final field/resource/conditional-unit validation remains in the existing
        // format writer INSIDE the single History transaction. Query availability
        // does not promise every requested enum/value is writable for this source.
    }
    pub fn authorizeOwner(self: Backend, selected: m.Owner) !void {
        _ = try self.owner(selected);
    }
    pub fn validateRange(self: Backend, selected: m.Owner, range: m.Range) !void {
        _ = try self.owner(selected);
        const range_spans = try @import("character_style_snapshot.zig").read(self.session, selected.section, selected.paragraph);
        defer self.session.allocator.free(range_spans);
        if (range_spans.len == 0) return error.MissingCharacterResource;
        const id = range_spans[0].char_shape_id orelse return error.InvalidCharacterShapeReference;
        // Native's existing readonly validator owns scalar/control/field boundaries.
        try @import("character_style_session.zig").validate(self.session, selected.section, selected.paragraph, range.startUnit, range.endUnit, id);
    }
    pub fn authorizeField(self: Backend, a: std.mem.Allocator, selected: m.Owner, field: []const u8) !void {
        if (!std.mem.startsWith(u8, field, "paragraph.margins.")) return;
        var local: ?@import("formatting_preflight.zig").Context = null;
        defer if (local) |*owned| owned.deinit();
        const context = if (self.snapshot) |snapshot| blk: {
            if (snapshot.preflight_context == null) snapshot.preflight_context = try @import("formatting_preflight.zig").Context.init(a, self.session);
            break :blk &snapshot.preflight_context.?;
        } else blk: {
            local = try @import("formatting_preflight.zig").Context.init(a, self.session);
            break :blk &local.?;
        };
        const id = try self.session.paragraphShapeId(selected.section, selected.paragraph);
        const source_preflight = @import("formatting_preflight.zig");
        try source_preflight.authorizeParagraph(a, &context.tree, try source_preflight.node(a, &context.tree, "paraPr", id), field);
    }
    pub fn preflight(self: Backend, a: std.mem.Allocator, selected: m.Owner, ranges: []const m.Range, patch: m.Patch) !void {
        if (!patch.hasCharacter() and !patch.hasParagraph()) return;
        if (self.snapshot) |snapshot| {
            if (snapshot.preflight_context == null) snapshot.preflight_context = try @import("formatting_preflight.zig").Context.init(a, self.session);
            return @import("formatting_preflight.zig").validateContext(a, self.session, &snapshot.preflight_context.?, selected, ranges, patch);
        }
        try @import("formatting_preflight.zig").validate(a, self.session, selected, ranges, patch);
    }
    pub fn validateFonts(self: Backend, patch: m.Patch) !void {
        if (!common.needsFontValidation(patch)) return;
        const rows = try self.readFaces(self.session.allocator);
        defer if (self.snapshot == null) @import("font_face_snapshot.zig").deinit(self.session.allocator, rows);
        try common.validateFonts(patch, rows);
    }
    pub fn spans(self: Backend, a: std.mem.Allocator, selected: m.Owner) ![]p.Span {
        const rows = try @import("character_style_snapshot.zig").read(self.session, selected.section, selected.paragraph);
        // These are transient Session-owned input rows, not the cached p.Span copy.
        defer self.session.allocator.free(rows);
        const output = try a.alloc(p.Span, rows.len);
        errdefer a.free(output);
        for (rows, output) |v, *row| row.* = .{ .start = std.math.cast(u32, v.start_unit) orelse return error.LimitExceeded, .end = std.math.cast(u32, v.end_unit) orelse return error.LimitExceeded, .resource = v.char_shape_id };
        return output;
    }
    fn currentContext(self: Backend, a: std.mem.Allocator, local: *?@import("formatting_preflight.zig").Context) !*@import("formatting_preflight.zig").Context {
        if (self.snapshot) |snapshot| {
            if (snapshot.preflight_context == null) snapshot.preflight_context = try @import("formatting_preflight.zig").Context.init(a, self.session);
            return &snapshot.preflight_context.?;
        }
        local.* = try @import("formatting_preflight.zig").Context.init(a, self.session);
        return &local.*.?;
    }
    pub fn characterField(self: Backend, a: std.mem.Allocator, id: u32, field: []const u8) !p.Observation {
        if (eq(field, "character.border") or eq(field, "character.background")) {
            var local: ?@import("formatting_preflight.zig").Context = null;
            defer if (local) |*value| value.deinit();
            const context = self.currentContext(a, &local) catch |err| return if (err == error.OutOfMemory) err else p.unknown(@errorName(err), "MissingSourceField");
            const value = @import("paragraph_border_fill_session.zig").observeWithContext(a, self.session, context, "charPr", id, field) catch |err| return if (err == error.OutOfMemory) err else p.unknown(@errorName(err), "MissingSourceField");
            return @import("../model/border_fill_projection.zig").field(a, value, field);
        }

        if (eq(field, "character.shadow") or std.mem.startsWith(u8, field, "character.shadow.")) {
            var local: ?@import("formatting_preflight.zig").Context = null;
            defer if (local) |*value| value.deinit();
            const context = try self.currentContext(a, &local);
            const node = try @import("formatting_preflight.zig").node(a, &context.tree, "charPr", id);
            const raw = try @import("character_shadow_patch.zig").read(a, &context.tree, node);
            return @import("../model/shadow_observation.zig").field(a, .{ .kind = raw.kind, .x = raw.offset_x, .y = raw.offset_y, .color = raw.color, .present = raw.present, .@"opaque" = raw.@"opaque" }, field);
        }
        const shapes = try self.readCharacters(a);
        defer if (self.snapshot == null) self.session.allocator.free(shapes);
        for (shapes) |shape| if (shape.id == id) {
            if (eq(field, "character.size")) return if (shape.height) |v| p.known(p.integer(v), true, null, "hundredth-point") else p.unknown("MissingCharacterSize", "MissingSourceField");
            if (eq(field, "character.bold")) return p.known(p.boolean(shape.bold), true, null, null);
            if (eq(field, "character.italic")) return p.known(p.boolean(shape.italic), true, null, null);
            if (eq(field, "character.textColor")) return if (shape.text_color) |v| p.known(p.integer(v), true, null, "RGB24") else p.unknown("AutoOrMissingTextColor", "AutoColorIntentUnavailable");
            if (eq(field, "character.shade")) return if (shape.shade) |v| common.shade(a, v) else p.unknown("MissingShade", "MissingSourceField");
            if (eq(field, "character.outlineKind")) {
                const value = shape.outline orelse return p.unknown("MissingOutline", "MissingSourceField");
                if (value == .unknown) return p.unknown("UnsupportedSourceOutline", "UnsupportedSourceOutline");
                return p.known(try p.text(a, @tagName(value)), true, null, null);
            }
            if (eq(field, "character.effects.relief")) return common.effect(a, shape.effects.emboss, shape.effects.engrave, "none", "emboss", "engrave");
            if (eq(field, "character.effects.script")) return common.effect(a, shape.effects.superscript, shape.effects.subscript, "normal", "superscript", "subscript");
            if (std.mem.startsWith(u8, field, "character.fonts.")) {
                const ids = shape.font_ids orelse return p.unknown("MissingFontReferences", "MissingSourceField");
                if (std.mem.endsWith(u8, field, ".id")) return common.fontField(a, ids, null, field);
                const faces = try self.readFaces(self.session.allocator);
                defer if (self.snapshot == null) @import("font_face_snapshot.zig").deinit(self.session.allocator, faces);
                return common.fontField(a, ids, faces, field);
            }
            if (eq(field, "character.fonts")) return common.fontIds(a, shape.font_ids orelse return p.unknown("MissingFontReferences", "MissingSourceField"));
            if (eq(field, "character.fontNames")) {
                const faces = try self.readFaces(self.session.allocator);
                defer if (self.snapshot == null) @import("font_face_snapshot.zig").deinit(self.session.allocator, faces);
                return common.fontNames(a, shape.font_ids orelse return p.unknown("MissingFontReferences", "MissingSourceField"), faces);
            }
            if (eq(field, "character.underline.kind") or eq(field, "character.underline.color") or eq(field, "character.underline.style")) {
                const rows = try self.readUnderlines();
                defer if (self.snapshot == null) @import("character_underline_snapshot.zig").deinit(self.session.allocator, rows);
                for (rows) |row| if (row.id == id) {
                    if (eq(field, "character.underline.kind")) return if (row.kind) |v| p.known(try p.text(a, @tagName(v)), true, null, null) else p.unknown("MissingUnderlineKind", "MissingSourceField");
                    if (eq(field, "character.underline.style")) return if (row.shape) |v| p.known(try p.text(a, v), @import("../model/character_line_style.zig").fromXml(v, false) != null, if (@import("../model/character_line_style.zig").fromXml(v, false) == null) "UnsupportedCharacterLineStyle" else null, "raw-style") else p.unknown("MissingUnderlineStyle", "MissingSourceField");
                    const raw = row.color orelse return p.unknown("MissingUnderlineColor", "MissingSourceField");
                    const v = @import("../model/rgb_color.zig").xml(raw) orelse return p.unknown("UnknownUnderlineColor", "UnknownSourceColor");
                    return p.known(p.integer(v), true, null, "RGB24");
                };
                return error.InvalidCharacterShapeReference;
            }
            if (eq(field, "character.strike.enabled") or eq(field, "character.strike.color")) {
                var local: ?@import("formatting_preflight.zig").Context = null;
                defer if (local) |*local_context| local_context.deinit();
                const context = if (self.snapshot) |snapshot| blk: {
                    if (snapshot.preflight_context == null) snapshot.preflight_context = try @import("formatting_preflight.zig").Context.init(a, self.session);
                    break :blk &snapshot.preflight_context.?;
                } else blk: {
                    local = try @import("formatting_preflight.zig").Context.init(a, self.session);
                    break :blk &local.?;
                };
                if (eq(field, "character.strike.enabled")) return p.known(p.boolean(try @import("character_strike_current.zig").read(self.session, &context.tree, id)), true, null, null);
                return if (try @import("character_strike_color_current.zig").read(self.session, &context.tree, id)) |v| p.known(p.integer(v), true, null, "RGB24") else p.unknown("MissingStrikeColor", "MissingSourceField");
            }
            inline for (.{ .{ "ratio", "ratio" }, .{ "charSpacing", "spacing" }, .{ "relativeSize", "relativeSize" }, .{ "offset", "offset" } }) |entry| {
                if (eq(field, "character." ++ entry[0])) {
                    const rows = try self.readMetrics();
                    defer if (self.snapshot == null) self.session.allocator.free(rows);
                    for (rows) |row| if (row.id == id) {
                        const values = @field(row.values, entry[1]) orelse return p.unknown("MissingSourceMetric", "MissingSourceField");
                        var result = p.map(a);
                        const metric_name = if (comptime std.mem.eql(u8, entry[0], "charSpacing")) "char_spacing" else if (comptime std.mem.eql(u8, entry[0], "relativeSize")) "relative_size" else entry[0];
                        const bounds = comptime @import("../model/character_metric_patch.zig").bounds(metric_name);
                        var writable = true;
                        for (values, common.languages) |value, language| {
                            if (value) |v| if (v < bounds.low or v > bounds.high) {
                                writable = false;
                            };
                            try p.put(a, &result, language, p.integer(value orelse return p.unknown("MissingLanguageMetric", "MissingSourceField")));
                        }
                        return p.known(result, writable, if (writable) null else "UnsupportedSourceMetricValue", "raw-source-metric");
                    };
                    return error.InvalidCharacterShapeReference;
                }
            }
            if (eq(field, "character.strike.style")) {
                const rows = try self.readStrikes();
                defer if (self.snapshot == null) @import("character_strike_styles.zig").deinit(self.session.allocator, rows);
                for (rows) |row| if (row.id == id) {
                    const value = row.shape orelse return p.unknown("MissingStrikeStyle", "MissingSourceField");
                    return p.known(try p.text(a, value), @import("../model/character_line_style.zig").fromXml(value, true) != null, if (std.mem.eql(u8, value, "NONE")) "InactiveCharacterStrikeStyle" else if (@import("../model/character_line_style.zig").fromXml(value, true) == null) "UnsupportedCharacterLineStyle" else null, "raw-style");
                };
                return error.InvalidCharacterShapeReference;
            }
            return p.unavailable("ProjectionReaderNotConnected");
        };
        return error.InvalidCharacterShapeReference;
    }
    pub fn paragraphField(self: Backend, a: std.mem.Allocator, selected: m.Owner, field: []const u8) !p.Observation {
        if (eq(field, "reset.style")) {
            const resources = self.resetResources(selected, a) catch |err| return if (err == error.OutOfMemory) err else p.unknown(@errorName(err), "MissingSourceField");
            var row = p.map(a);
            try p.put(a, &row, "basis", try p.text(a, "paragraph-style"));
            try p.put(a, &row, "characterAvailable", p.boolean(resources.character != null));
            try p.put(a, &row, "paragraphAvailable", p.boolean(resources.paragraph != null));
            return p.known(row, resources.character != null or resources.paragraph != null, null, null);
        }
        if (eq(field, "paragraph.border") or eq(field, "paragraph.background")) {
            const identity = try self.session.paragraphShapeId(selected.section, selected.paragraph);
            var local: ?@import("formatting_preflight.zig").Context = null;
            defer if (local) |*value| value.deinit();
            const context = self.currentContext(a, &local) catch |err| return if (err == error.OutOfMemory) err else p.unknown(@errorName(err), "MissingSourceField");
            const value = @import("paragraph_border_fill_session.zig").observeWithContext(a, self.session, context, "paraPr", identity, field) catch |err| return if (err == error.OutOfMemory) err else p.unknown(@errorName(err), "MissingSourceField");
            return @import("../model/border_fill_projection.zig").field(a, value, field);
        }

        const id = try self.session.paragraphShapeId(selected.section, selected.paragraph);
        if (eq(field, "paragraph.grid") or eq(field, "paragraph.borderConnect")) {
            var local: ?@import("formatting_preflight.zig").Context = null;
            defer if (local) |*value| value.deinit();
            const context = try self.currentContext(a, &local);
            const node = try @import("formatting_preflight.zig").node(a, &context.tree, "paraPr", id);
            const flags = try @import("paragraph_flags_patch.zig").read(a, &context.tree, node);
            const value = if (eq(field, "paragraph.grid")) flags.grid else flags.border_connect;
            if (value) |v| return p.known(p.boolean(v), true, null, null);
            var requested: @import("../model/paragraph_flags.zig").Patch = .{};
            if (eq(field, "paragraph.grid")) requested.grid = false else requested.border_connect = false;
            const probe = @import("paragraph_flags_patch.zig").write(a, &context.tree, node, requested, self.session.options.max_xml_bytes) catch |err| return if (err == error.OutOfMemory) err else p.unknown(@errorName(err), @errorName(err));
            a.free(probe);
            return p.replaceableUnknown(if (eq(field, "paragraph.grid")) "MissingParagraphGrid" else "MissingParagraphBorderConnect", null);
        }

        const shapes = try self.readParagraphs(a);
        defer if (self.snapshot == null) @import("paragraph_display_resources.zig").deinit(self.session.allocator, shapes);
        for (shapes) |shape| if (shape.id == id) return paragraphFromShape(a, shape, field);
        return error.InvalidParagraphShapeReference;
    }
    pub fn paragraphFromShape(a: std.mem.Allocator, shape: @import("paragraph_display_owned.zig").Shape, field: []const u8) !p.Observation {
        if (eq(field, "paragraph.alignment")) {
            const value = shape.horizontal orelse return p.unknown("MissingAlignment", "MissingSourceField");
            _ = std.meta.stringToEnum(m.Alignment, value) orelse return p.unknown("UnknownAlignment", "UnsupportedSourceAlignment");
            return p.known(try p.text(a, value), true, null, null);
        }
        inline for (.{ "indent", "left", "right", "before", "after" }, 0..) |name, index| {
            if (eq(field, "paragraph.margins." ++ name)) {
                const measure = shape.margins[index] orelse return p.unknown("MissingMargin", "MissingSourceField");
                const value = measure.value orelse return p.unknown("MissingMarginValue", "MissingSourceField");
                const unit = measure.unit orelse "HWPUNIT"; // HWPValue schema default; preserve absent source attribute.
                const writable = eq(unit, "HWPUNIT");
                return p.known(p.integer(value), writable, if (writable) null else "UnsupportedParagraphMarginUnit", try a.dupe(u8, unit));
            }
        }
        if (eq(field, "paragraph.spacing.kind") or eq(field, "paragraph.spacing.value")) {
            const kind = shape.spacing_type orelse return p.unknown("MissingSpacingKind", "MissingSourceField");
            const names = @import("paragraph_spacing_patch.zig").names;
            var index: ?usize = null;
            for (names, 0..) |name, i| if (eq(name, kind)) {
                index = i;
                break;
            };
            const selected_kind = index orelse return p.unknown("UnknownSpacingKind", "UnsupportedSourceSpacing");
            if (eq(field, "paragraph.spacing.kind")) {
                const public = [_][]const u8{ "percent", "fixed", "between", "at_least" };
                return p.known(try p.text(a, public[selected_kind]), true, null, null);
            }
            const measure = shape.spacing orelse return p.unknown("MissingSpacing", "MissingSourceField");
            const value = measure.value orelse return p.unknown("MissingSpacingValue", "MissingSourceField");
            if (selected_kind == 0) return p.known(p.integer(value), true, null, "percent");
            const unit = measure.unit orelse "HWPUNIT";
            const writable = eq(unit, "HWPUNIT");
            return p.known(p.integer(value), writable, if (writable) null else "UnsupportedParagraphSpacingUnit", try a.dupe(u8, unit));
        }
        return p.unavailable("FormattingFieldNotImplemented");
    }
};
fn eq(l: []const u8, r: []const u8) bool {
    return std.mem.eql(u8, l, r);
}
