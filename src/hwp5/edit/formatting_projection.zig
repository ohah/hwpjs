//! Read-only snapshots from the same live Session consumed by History.
const std = @import("std");
const p = @import("../../model/formatting_projection.zig");
const m = @import("../../model/formatting_patch.zig");
const common = @import("../../model/formatting_source_values.zig");
const eq = common.eq;
const Session = @import("style_preservation.zig").Session;
pub const Backend = struct {
    session: *Session,
    allocator: std.mem.Allocator,
    snapshot: ?*Snapshot = null,
    pub const Snapshot = struct {
        allocator: std.mem.Allocator,
        characters: ?[]@import("character_display_shapes.zig").Shape = null,
        paragraphs: ?[]@import("paragraph_display_shapes.zig").Shape = null,
        faces: ?[]@import("../../model/font_face_value.zig").Value = null,
        preflight_source: ?Session.FormattingSource = null,
        pub fn deinit(self: *Snapshot) void {
            if (self.preflight_source) |*source| source.deinit();
            if (self.characters) |rows| self.allocator.free(rows);
            if (self.paragraphs) |rows| self.allocator.free(rows);
            if (self.faces) |rows| @import("../../model/font_face_value.zig").deinit(self.allocator, rows);
            self.* = .{ .allocator = self.allocator };
        }
    };
    fn readCharacters(self: Backend, a: std.mem.Allocator) ![]@import("character_display_shapes.zig").Shape {
        if (self.snapshot) |snapshot| {
            if (snapshot.characters) |rows| return rows;
            const rows = try self.session.characterShapes(snapshot.allocator);
            snapshot.characters = rows;
            return rows;
        }
        return self.session.characterShapes(a);
    }
    fn readParagraphs(self: Backend, a: std.mem.Allocator) ![]@import("paragraph_display_shapes.zig").Shape {
        if (self.snapshot) |snapshot| {
            if (snapshot.paragraphs) |rows| return rows;
            const rows = try self.session.paragraphShapes(snapshot.allocator);
            snapshot.paragraphs = rows;
            return rows;
        }
        return self.session.paragraphShapes(a);
    }
    fn readFaces(self: Backend, a: std.mem.Allocator) ![]@import("../../model/font_face_value.zig").Value {
        if (self.snapshot) |snapshot| {
            if (snapshot.faces) |rows| return rows;
            const rows = try self.session.fontFaces(snapshot.allocator);
            snapshot.faces = rows;
            return rows;
        }
        return self.session.fontFaces(a);
    }
    pub fn resetResources(self: Backend, selected: m.Owner, a: std.mem.Allocator) !m.ResetResources {
        _ = try self.owner(selected);
        return @import("formatting_style_reset.zig").read(self.session, a, selected);
    }
    pub fn owner(self: Backend, value: m.Owner) !m.Owner {
        const info = try self.session.paragraph(value.section, value.paragraph);
        if (info.source_node == null) return error.UnsupportedFormattingOwner;
        const ref = try self.session.currentSourceParagraphReference(value.section, value.paragraph);
        if (ref != .source or ref.source.host != .original_node) return error.UnsupportedFormattingOwner;
        return value;
    }
    pub fn authorize(self: Backend, selected: m.Owner, ranges: []const m.Range, field: []const u8) !void {
        try self.authorizeOwner(selected);
        try self.authorizeField(self.allocator, selected, field);
        if (std.mem.startsWith(u8, field, "character.")) {
            if (ranges.len == 0) return error.CharacterRangeRequired;
            for (ranges) |range| try self.validateRange(selected, range);
        }
    }
    pub fn authorizeOwner(self: Backend, selected: m.Owner) !void {
        _ = try self.owner(selected);
        var protection = try self.session.textSourceProtection(self.allocator, selected.section);
        defer protection.deinit(self.allocator);
        if (selected.paragraph >= protection.protected_paragraphs.len) return error.SourceBindingMismatch;
        if (protection.protected_paragraphs[selected.paragraph]) return error.ProtectedFormattingOwner;
    }
    pub fn validateRange(self: Backend, selected: m.Owner, range: m.Range) !void {
        _ = try self.owner(selected);
        const bytes = try self.session.copyText(self.allocator, selected.section, selected.paragraph);
        defer self.allocator.free(bytes);
        try @import("control_boundaries.zig").validateRetainedText(bytes);
        try @import("control_boundaries.zig").validate(bytes, range.startUnit, range.endUnit);
    }
    pub fn authorizeField(_: Backend, _: std.mem.Allocator, _: m.Owner, _: []const u8) !void {}
    pub fn preflight(self: Backend, a: std.mem.Allocator, selected: m.Owner, ranges: []const m.Range, patch: m.Patch) !void {
        if (self.snapshot) |snapshot| {
            if (patch.hasCharacter() and snapshot.preflight_source == null) snapshot.preflight_source = try self.session.formattingSource(a);
            return self.session.validateFormattingSource(a, selected, ranges, patch, if (snapshot.preflight_source) |*source| source else null);
        }
        try self.session.validateFormattingSource(a, selected, ranges, patch, null);
    }
    pub fn validateFonts(self: Backend, patch: m.Patch) !void {
        if (!common.needsFontValidation(patch)) return;
        const rows = try self.readFaces(self.allocator);
        defer if (self.snapshot == null) @import("../../model/font_face_value.zig").deinit(self.allocator, rows);
        try common.validateFonts(patch, rows);
    }
    pub fn spans(self: Backend, a: std.mem.Allocator, selected: m.Owner) ![]p.Span {
        const original = try self.session.characterRanges(a, selected.section, selected.paragraph);
        defer a.free(original);
        const output = try a.alloc(p.Span, original.len);
        for (original, output) |v, *row| row.* = .{ .start = v.start_unit, .end = v.end_unit, .resource = v.char_shape_id };
        return output;
    }
    pub fn characterField(self: Backend, a: std.mem.Allocator, id: u32, field: []const u8) !p.Observation {
        if (eq(field, "character.border") or eq(field, "character.background")) {
            var source = try self.session.formattingSource(a);
            defer source.deinit();
            const value = @import("border_fill_character_current.zig").observe(source.bytes, source.version, id) catch |err| return if (err == error.OutOfMemory) err else p.unknown(@errorName(err), "MissingSourceField");
            return @import("../../model/border_fill_projection.zig").field(a, value, field);
        }

        const shapes = try self.readCharacters(a);
        defer if (self.snapshot == null) a.free(shapes);
        for (shapes) |shape| if (shape.id == id) {
            if (eq(field, "character.shadow") or std.mem.startsWith(u8, field, "character.shadow.")) {
                const raw = shape.shadow orelse return p.unknown("MissingShadow", "MissingSourceField");
                const value: @import("../../model/shadow_observation.zig").Value = .{ .kind = if (raw.kind_raw == 3) null else @as(@import("../../model/character_shadow.zig").Kind, @fromBackingInt(raw.kind_raw)), .x = raw.offset_x, .y = raw.offset_y, .color = if (raw.color_raw <= 0xffffff) @import("../../model/rgb_color.zig").hwp5(raw.color_raw) else null, .@"opaque" = raw.kind_raw == 3 };
                return @import("../../model/shadow_observation.zig").field(a, value, field);
            }
            const d = @import("character_decoration_compat.zig").resolve(shape);
            if (eq(field, "character.size")) return p.known(p.integer(shape.height), true, null, "hundredth-point");
            if (eq(field, "character.bold")) return p.known(p.boolean(shape.bold), true, null, null);
            if (eq(field, "character.italic")) return p.known(p.boolean(shape.italic), true, null, null);
            if (eq(field, "character.textColor")) return common.color(shape.text_color_raw);
            if (eq(field, "character.underline.color")) return common.color(shape.underline_color_raw);
            if (eq(field, "character.strike.color")) return if (d.strike_color) |v| common.color(v) else p.unknown("MissingStrikeColorSlot", "MissingSourceField");
            if (eq(field, "character.strike.enabled")) return if (d.strike_enabled) |v| p.known(p.boolean(v), true, null, null) else p.unknown("UnsupportedSourceStrikeKind", "UnsupportedSourceStrikeKind");
            if (eq(field, "character.underline.kind")) {
                const names = [_][]const u8{ "none", "bottom", "center", "top" };
                // Source CENTER may be changed to a supported kind. Only a
                // requested CENTER is rejected by character_property_payload.
                return p.known(try p.text(a, names[d.underline_kind]), true, null, null);
            }
            if (eq(field, "character.underline.style")) return p.known(p.integer(shape.underline_style_raw), @import("../../model/character_line_style.zig").fromHwp5(shape.underline_style_raw) != null and !@import("character_decoration_compat.zig").legacyStrike(shape.underline_kind_raw, shape.strike_kind_raw), if (@import("character_decoration_compat.zig").legacyStrike(shape.underline_kind_raw, shape.strike_kind_raw)) "UnsupportedLegacyCharacterDecorations" else if (@import("../../model/character_line_style.zig").fromHwp5(shape.underline_style_raw) == null) "UnsupportedCharacterLineStyle" else null, "raw-style");
            if (eq(field, "character.strike.style")) return p.known(p.integer(d.strike_style), @import("../../model/character_line_style.zig").fromHwp5(d.strike_style) != null and d.strike_enabled != null, if (d.strike_enabled == null) "UnsupportedCharacterStrikeKind" else if (@import("../../model/character_line_style.zig").fromHwp5(d.strike_style) == null) "UnsupportedCharacterLineStyle" else null, "raw-style");
            if (eq(field, "character.outlineKind")) {
                const names = [_][]const u8{ "none", "solid", "dot", "thick", "dash", "dash_dot", "dash_dot_dot" };
                if (shape.outline_kind_raw >= names.len) return p.unknown("UnsupportedSourceOutline", "UnsupportedSourceOutline");
                return p.known(try p.text(a, names[shape.outline_kind_raw]), true, null, null);
            }
            if (eq(field, "character.shade")) return common.shade(a, @import("../../model/shade_color.zig").hwp5(shape.shade_color_raw));
            if (eq(field, "character.effects.relief")) return common.effect(a, shape.effects.emboss, shape.effects.engrave, "none", "emboss", "engrave");
            if (eq(field, "character.effects.script")) return common.effect(a, shape.effects.superscript, shape.effects.subscript, "normal", "superscript", "subscript");
            const ids = @import("../../model/character_fonts.zig").fromHwp5(shape.font_ids);
            if (std.mem.startsWith(u8, field, "character.fonts.")) {
                if (std.mem.endsWith(u8, field, ".id")) return common.fontField(a, ids, null, field);
                const faces = try self.readFaces(a);
                defer if (self.snapshot == null) @import("../../model/font_face_value.zig").deinit(a, faces);
                return common.fontField(a, ids, faces, field);
            }
            if (eq(field, "character.fonts")) return common.fontIds(a, ids);
            if (eq(field, "character.fontNames")) {
                const faces = try self.readFaces(a);
                defer if (self.snapshot == null) @import("../../model/font_face_value.zig").deinit(a, faces);
                return common.fontNames(a, ids, faces);
            }
            inline for (.{ .{ "ratio", "ratio" }, .{ "charSpacing", "spacing" }, .{ "relativeSize", "relativeSize" }, .{ "offset", "offset" } }) |entry| {
                if (eq(field, "character." ++ entry[0])) return common.metrics(a, @field(shape.font_metrics, entry[1]), if (comptime std.mem.eql(u8, entry[0], "charSpacing")) "char_spacing" else if (comptime std.mem.eql(u8, entry[0], "relativeSize")) "relative_size" else entry[0]);
            }
            return p.unavailable("FormattingFieldNotImplemented");
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
            var source = try self.session.formattingSource(a);
            defer source.deinit();
            const identity = try self.session.paragraphShapeId(selected.section, selected.paragraph);
            const value = @import("border_fill_paragraph_current.zig").observe(source.bytes, source.version, identity) catch |err| return if (err == error.OutOfMemory) err else p.unknown(@errorName(err), "MissingSourceField");
            var result = try @import("../../model/border_fill_projection.zig").field(a, value, field);
            if (try @import("border_fill_paragraph_current.zig").alignment(source.bytes, source.version, identity) > 5) {
                result.writable = false;
                result.writeUnavailableReason = "UnsupportedSourceAlignment";
            }
            return result;
        }

        const id = try self.session.paragraphShapeId(selected.section, selected.paragraph);
        const shapes = try self.readParagraphs(a);
        defer if (self.snapshot == null) a.free(shapes);
        for (shapes) |shape| if (shape.id == id) {
            if (eq(field, "paragraph.grid")) return if (shape.flags.grid) |v| p.known(p.boolean(v), shape.alignment <= 5, if (shape.alignment <= 5) null else "UnsupportedSourceAlignment", null) else p.unknown("MissingParagraphGrid", "MissingSourceField");
            if (eq(field, "paragraph.borderConnect")) return if (shape.flags.border_connect) |v| p.known(p.boolean(v), shape.alignment <= 5, if (shape.alignment <= 5) null else "UnsupportedSourceAlignment", null) else p.unknown("MissingParagraphBorderConnect", "MissingSourceField");
            if (eq(field, "paragraph.alignment")) {
                const names = [_][]const u8{ "JUSTIFY", "LEFT", "RIGHT", "CENTER", "DISTRIBUTE", "DISTRIBUTE_SPACE" };
                if (shape.alignment >= names.len) return p.unknown("UnsupportedSourceAlignment", "UnsupportedSourceAlignment");
                return p.known(try p.text(a, names[shape.alignment]), true, null, null);
            }
            inline for (.{ "left", "right", "indent", "before", "after" }) |name| {
                if (eq(field, "paragraph.margins." ++ name)) return p.known(p.integer(@field(shape, name)), true, null, "hwp5-source-unit");
            }
            const spacing = @import("paragraph_spacing_values.zig").effective(shape);
            if (eq(field, "paragraph.spacing.kind")) {
                const names = [_][]const u8{ "percent", "fixed", "between", "at_least" };
                if (spacing.kind >= names.len) return p.unknown("UnsupportedSourceSpacing", "UnsupportedSourceSpacing");
                return p.known(try p.text(a, names[spacing.kind]), true, null, null);
            }
            if (eq(field, "paragraph.spacing.value")) return if (spacing.kind <= 3) p.known(p.integer(spacing.value), true, null, if (spacing.kind == 0) "percent" else "hwp5-source-unit") else p.unknown("UnsupportedSourceSpacing", "UnsupportedSourceSpacing");
            return p.unavailable("FormattingFieldNotImplemented");
        };
        return error.InvalidParagraphShapeReference;
    }
};
