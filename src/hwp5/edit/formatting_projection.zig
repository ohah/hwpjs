//! Read-only snapshots from the same live Session consumed by History.
const std = @import("std");
const p = @import("../../model/formatting_projection.zig");
const m = @import("../../model/formatting_patch.zig");
const common = @import("../../model/formatting_source_values.zig");
const eq = common.eq;
const Session = @import("style_preservation.zig").Session;
pub const TestWork = struct {
    ownership_reads: usize = 0,
    protection_reads: usize = 0,
    formatting_sources: usize = 0,
    reset_reads: usize = 0,
    character_border_reads: usize = 0,
    paragraph_border_reads: usize = 0,
    paragraph_alignment_reads: usize = 0,
};
// Instrumentation has no storage or instructions in a product build.
pub var test_work: if (@import("builtin").is_test) TestWork else void = if (@import("builtin").is_test) .{} else {};
pub const Backend = struct {
    session: *Session,
    allocator: std.mem.Allocator,
    snapshot: ?*Snapshot = null,
    pub const Snapshot = struct {
        allocator: std.mem.Allocator,
        face_index: ?common.FontFaceIndex = null,
        character_ids: ?std.AutoHashMapUnmanaged(u32, usize) = null,
        paragraph_ids: ?std.AutoHashMapUnmanaged(u32, usize) = null,
        characters: ?[]@import("character_display_shapes.zig").Shape = null,
        paragraphs: ?[]@import("paragraph_display_shapes.zig").Shape = null,
        faces: ?[]@import("../../model/font_face_value.zig").Value = null,
        preflight_source: ?Session.FormattingSource = null,
        // Immutable-template ownership, scoped to one query/preflight. A section
        // is inspected once even when several generated targets share it.
        ownership_flows: std.AutoHashMapUnmanaged(usize, []@import("paragraph_flow_snapshot.zig").Flow) = .empty,
        protections: std.AutoHashMapUnmanaged(usize, @import("text_source_protection.zig").Snapshot) = .empty,
        protection_errors: std.AutoHashMapUnmanaged(usize, anyerror) = .empty,
        reset_resources: std.AutoHashMapUnmanaged(u8, anyerror!m.ResetResources) = .empty,
        character_borders: std.AutoHashMapUnmanaged(u32, anyerror!@import("../../model/border_fill_patch.zig").Value) = .empty,
        paragraph_borders: std.AutoHashMapUnmanaged(u32, anyerror!@import("../../model/border_fill_patch.zig").Value) = .empty,
        border_alignments: std.AutoHashMapUnmanaged(u32, anyerror!u32) = .empty,
        pub fn deinit(self: *Snapshot) void {
            var protections = self.protections.valueIterator();
            while (protections.next()) |value| value.deinit(self.allocator);
            self.protections.deinit(self.allocator);
            self.protection_errors.deinit(self.allocator);
            self.reset_resources.deinit(self.allocator);
            self.character_borders.deinit(self.allocator);
            self.paragraph_borders.deinit(self.allocator);
            self.border_alignments.deinit(self.allocator);
            var flows = self.ownership_flows.valueIterator();
            while (flows.next()) |rows| self.allocator.free(rows.*);
            self.ownership_flows.deinit(self.allocator);
            if (self.face_index) |*index| index.deinit();
            if (self.character_ids) |*ids| ids.deinit(self.allocator);
            if (self.paragraph_ids) |*ids| ids.deinit(self.allocator);
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
        if (self.snapshot) |snapshot| {
            const style = (try self.session.paragraph(selected.section, selected.paragraph)).style_id;
            if (snapshot.reset_resources.get(style)) |value| return value;
            if (@import("builtin").is_test) test_work.reset_reads += 1;
            const result = @import("formatting_style_reset.zig").read(self.session, snapshot.allocator, selected);
            if (result) |_| {} else |err| if (err == error.OutOfMemory) return err;
            try snapshot.reset_resources.put(snapshot.allocator, style, result);
            return result;
        }
        return @import("formatting_style_reset.zig").read(self.session, a, selected);
    }
    fn readFormattingSource(self: Backend, a: std.mem.Allocator) !Session.FormattingSource {
        if (self.snapshot) |snapshot| {
            if (snapshot.preflight_source) |source| return source;
            if (@import("builtin").is_test) test_work.formatting_sources += 1;
            const source = try self.session.formattingSource(snapshot.allocator);
            snapshot.preflight_source = source;
            return source;
        }
        return self.session.formattingSource(a);
    }
    fn readBorder(self: Backend, source: Session.FormattingSource, id: u32, comptime character: bool) !@import("../../model/border_fill_patch.zig").Value {
        if (self.snapshot) |snapshot| {
            const cache = if (character) &snapshot.character_borders else &snapshot.paragraph_borders;
            if (cache.get(id)) |value| return value;
            if (@import("builtin").is_test) {
                if (character) test_work.character_border_reads += 1 else test_work.paragraph_border_reads += 1;
            }
            const resolver = if (character) @import("border_fill_character_current.zig") else @import("border_fill_paragraph_current.zig");
            const result = resolver.observe(source.bytes, source.version, id);
            if (result) |_| {} else |err| if (err == error.OutOfMemory) return err;
            try cache.put(snapshot.allocator, id, result);
            return result;
        }
        return if (character) @import("border_fill_character_current.zig").observe(source.bytes, source.version, id) else @import("border_fill_paragraph_current.zig").observe(source.bytes, source.version, id);
    }
    fn borderAlignment(self: Backend, source: Session.FormattingSource, id: u32) !u32 {
        if (self.snapshot) |snapshot| {
            if (snapshot.border_alignments.get(id)) |value| return value;
            if (@import("builtin").is_test) test_work.paragraph_alignment_reads += 1;
            const result = @import("border_fill_paragraph_current.zig").alignment(source.bytes, source.version, id);
            if (result) |_| {} else |err| if (err == error.OutOfMemory) return err;
            try snapshot.border_alignments.put(snapshot.allocator, id, result);
            return result;
        }
        return @import("border_fill_paragraph_current.zig").alignment(source.bytes, source.version, id);
    }
    pub fn owner(self: Backend, value: m.Owner) !m.Owner {
        const info = try self.session.paragraph(value.section, value.paragraph);
        const ref = try self.session.currentSourceParagraphReference(value.section, value.paragraph);
        if (info.source_node != null) {
            // Preserve the existing original-owner admission, including nested
            // original text. Only the new generated branch is BODY-specific.
            if (ref != .source or ref.source.host != .original_node) return error.UnsupportedFormattingOwner;
            return value;
        }
        if (ref != .source or ref.source.host != .generated_instance or info.parent_node != null) return error.UnsupportedFormattingOwner;
        const rows = try self.ownershipFlow(value.section);
        defer if (self.snapshot == null) self.allocator.free(rows);
        if (value.paragraph >= rows.len) return error.SourceBindingMismatch;
        const row = rows[value.paragraph];
        // paragraphFlow validates current parent/instance/template against the
        // immutable source tree. A mutable parent == null alone is not proof.
        if (row.paragraph != value.paragraph or !row.generated or row.source_node != null or
            !row.top_level or row.parent_node != null or row.host != .body)
            return error.UnsupportedFormattingOwner;
        return value;
    }
    fn ownershipFlow(self: Backend, section: usize) ![]@import("paragraph_flow_snapshot.zig").Flow {
        if (self.snapshot) |snapshot| {
            if (snapshot.ownership_flows.get(section)) |rows| return rows;
            if (@import("builtin").is_test) test_work.ownership_reads += 1;
            const rows = try self.session.paragraphFlow(snapshot.allocator, section);
            errdefer snapshot.allocator.free(rows);
            try snapshot.ownership_flows.put(snapshot.allocator, section, rows);
            return rows;
        }
        return self.session.paragraphFlow(self.allocator, section);
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
        var protection = try self.readProtection(selected.section);
        defer if (self.snapshot == null) protection.deinit(self.allocator);
        if (selected.paragraph >= protection.protected_paragraphs.len) return error.SourceBindingMismatch;
        if (protection.protected_paragraphs[selected.paragraph]) return error.ProtectedFormattingOwner;
    }
    fn readProtection(self: Backend, section: usize) !@import("text_source_protection.zig").Snapshot {
        if (self.snapshot) |snapshot| {
            if (snapshot.protections.get(section)) |value| return value;
            if (snapshot.protection_errors.get(section)) |err| return err;
            if (@import("builtin").is_test) test_work.protection_reads += 1;
            var value = self.session.textSourceProtection(snapshot.allocator, section) catch |err| {
                if (err == error.OutOfMemory) return err;
                try snapshot.protection_errors.put(snapshot.allocator, section, err);
                return err;
            };
            errdefer value.deinit(snapshot.allocator);
            try snapshot.protections.put(snapshot.allocator, section, value);
            return value;
        }
        return self.session.textSourceProtection(self.allocator, section);
    }
    pub fn validateRange(self: Backend, selected: m.Owner, range: m.Range) !void {
        _ = try self.owner(selected);
        const bytes = try self.session.copyText(self.allocator, selected.section, selected.paragraph);
        defer self.allocator.free(bytes);
        try @import("control_boundaries.zig").validateRetainedText(bytes);
        try @import("control_boundaries.zig").validate(bytes, range.startUnit, range.endUnit);
    }
    pub fn authorizeField(self: Backend, _: std.mem.Allocator, owner_value: m.Owner, field: []const u8) !void {
        if (eq(field, "paragraph.bullet")) try self.session.authorizeBullet(owner_value.section, owner_value.paragraph);
    }
    pub fn preflight(self: Backend, a: std.mem.Allocator, selected: m.Owner, ranges: []const m.Range, patch: m.Patch) !void {
        if (self.snapshot) |snapshot| {
            if (patch.hasCharacter() and snapshot.preflight_source == null) _ = try self.readFormattingSource(a);
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
    /// Empty caret observation is not a writable fake character range.
    pub fn insertionField(self: Backend, a: std.mem.Allocator, selected: m.Owner, unit: u32, field: []const u8) !p.Observation {
        _ = try self.owner(selected);
        if (unit != 0 or !std.mem.startsWith(u8, field, "character.")) return p.unknown("UnobservedInsertionPosition", "CaretTypingIntentRequired");
        const rows = try self.session.characterRanges(a, selected.section, selected.paragraph);
        defer a.free(rows);
        if (rows.len != 1 or !rows[0].insertion) return p.unknown("UnobservedInsertionPosition", "CaretTypingIntentRequired");
        const id = rows[0].char_shape_id orelse return p.unknown("MissingCharacterResource", "MissingSourceField");
        var value = try self.characterField(a, id, field);
        value.writable = false;
        value.writeUnavailableReason = "CaretTypingIntentRequired";
        return value;
    }
    fn indexedShapes(self: Backend, shapes: anytype, id: u32, comptime character: bool) !@TypeOf(shapes) {
        if (self.snapshot) |snapshot| {
            const slot = if (character) &snapshot.character_ids else &snapshot.paragraph_ids;
            if (slot.* == null) {
                var ids: std.AutoHashMapUnmanaged(u32, usize) = .empty;
                errdefer ids.deinit(snapshot.allocator);
                for (shapes, 0..) |shape, index| {
                    const entry = try ids.getOrPut(snapshot.allocator, shape.id);
                    if (!entry.found_existing) entry.value_ptr.* = index;
                }
                slot.* = ids;
            }
            if (slot.*.?.get(id)) |index| return shapes[index..][0..1];
            return shapes[0..0];
        }
        return shapes;
    }
    fn fontIndex(self: Backend, faces: []const @import("../../model/font_face_value.zig").Value) !?*const common.FontFaceIndex {
        if (self.snapshot) |snapshot| {
            if (snapshot.face_index == null) snapshot.face_index = try common.FontFaceIndex.init(snapshot.allocator, faces);
            return &snapshot.face_index.?;
        }
        return null;
    }
    pub fn characterField(self: Backend, a: std.mem.Allocator, id: u32, field: []const u8) !p.Observation {
        if (eq(field, "character.border") or eq(field, "character.background")) {
            var source = try self.readFormattingSource(a);
            defer if (self.snapshot == null) source.deinit();
            const value = self.readBorder(source, id, true) catch |err| return if (err == error.OutOfMemory) err else p.unknown(@errorName(err), "MissingSourceField");
            return @import("../../model/border_fill_projection.zig").field(a, value, field);
        }

        const shapes = try self.readCharacters(a);
        defer if (self.snapshot == null) a.free(shapes);
        for (try self.indexedShapes(shapes, id, true)) |shape| if (shape.id == id) {
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
                return common.fontFieldIndexed(a, ids, faces, field, try self.fontIndex(faces));
            }
            if (eq(field, "character.fonts")) return common.fontIds(a, ids);
            if (eq(field, "character.fontNames")) {
                const faces = try self.readFaces(a);
                defer if (self.snapshot == null) @import("../../model/font_face_value.zig").deinit(a, faces);
                return common.fontNamesIndexed(a, ids, faces, try self.fontIndex(faces));
            }
            inline for (.{ .{ "ratio", "ratio" }, .{ "charSpacing", "spacing" }, .{ "relativeSize", "relativeSize" }, .{ "offset", "offset" } }) |entry| {
                if (eq(field, "character." ++ entry[0])) return common.metrics(a, @field(shape.font_metrics, entry[1]), if (comptime std.mem.eql(u8, entry[0], "charSpacing")) "char_spacing" else if (comptime std.mem.eql(u8, entry[0], "relativeSize")) "relative_size" else entry[0]);
            }
            return p.unavailable("FormattingFieldNotImplemented");
        };
        return error.InvalidCharacterShapeReference;
    }
    pub fn paragraphField(self: Backend, a: std.mem.Allocator, selected: m.Owner, field: []const u8) !p.Observation {
        if (eq(field, "paragraph.bullet")) {
            self.session.authorizeBullet(selected.section, selected.paragraph) catch |err| return if (err == error.OutOfMemory) err else p.unknown(@errorName(err), @errorName(err));
            var source = try self.readFormattingSource(a);
            defer if (self.snapshot == null) source.deinit();
            const id = try self.session.paragraphShapeId(selected.section, selected.paragraph);
            const bullet = @import("bullet_apply.zig").reference(a, source.bytes, source.version, id) catch |err| return if (err == error.OutOfMemory) err else p.unknown(@errorName(err), @errorName(err));
            var value = p.map(a);
            try p.put(a, &value, "kind", try p.text(a, if (bullet.id != null) "existing" else "none"));
            if (bullet.id) |identity| try p.put(a, &value, "id", p.integer(identity));
            return p.known(value, true, null, null);
        }
        if (eq(field, "reset.style")) {
            const resources = self.resetResources(selected, a) catch |err| return if (err == error.OutOfMemory) err else p.unknown(@errorName(err), "MissingSourceField");
            var row = p.map(a);
            try p.put(a, &row, "basis", try p.text(a, "paragraph-style"));
            try p.put(a, &row, "characterAvailable", p.boolean(resources.character != null));
            try p.put(a, &row, "paragraphAvailable", p.boolean(resources.paragraph != null));
            return p.known(row, resources.character != null or resources.paragraph != null, null, null);
        }
        if (eq(field, "paragraph.border") or eq(field, "paragraph.background")) {
            var source = try self.readFormattingSource(a);
            defer if (self.snapshot == null) source.deinit();
            const identity = try self.session.paragraphShapeId(selected.section, selected.paragraph);
            const value = self.readBorder(source, identity, false) catch |err| return if (err == error.OutOfMemory) err else p.unknown(@errorName(err), "MissingSourceField");
            var result = try @import("../../model/border_fill_projection.zig").field(a, value, field);
            if (try self.borderAlignment(source, identity) > 5) {
                result.writable = false;
                result.writeUnavailableReason = "UnsupportedSourceAlignment";
            }
            return result;
        }

        const id = try self.session.paragraphShapeId(selected.section, selected.paragraph);
        const shapes = try self.readParagraphs(a);
        defer if (self.snapshot == null) a.free(shapes);
        for (try self.indexedShapes(shapes, id, false)) |shape| if (shape.id == id) {
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
