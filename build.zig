const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});
    const abi_check = b.addSystemCommand(&.{ "node", "tools/generate-abi.mjs", "--check" });
    const icc_registry_check = b.addSystemCommand(&.{ "node", "tools/icc-registry/generate.mjs", "--check" });
    const core = b.addModule("hwpjs", .{
        .root_source_file = b.path("src/root.zig"),
        .target = target,
        .optimize = optimize,
    });
    const tests = b.addTest(.{ .root_module = core });
    tests.step.dependOn(&icc_registry_check.step);
    const run_tests = b.addRunArtifact(tests);
    run_tests.step.dependOn(&abi_check.step);
    const core_test_step = b.step("test", "Run core and controlled text unit tests");
    core_test_step.dependOn(&run_tests.step);

    const preservation_module = b.createModule(.{
        .root_source_file = b.path("tests/hwp5/style-preservation/session.test.zig"),
        .target = target,
        .optimize = optimize,
    });
    preservation_module.addImport("hwpjs", core);
    const preservation_tests = b.addRunArtifact(b.addTest(.{ .root_module = preservation_module, .filters = &.{"style preservation"} }));
    const preservation_probe_module = b.createModule(.{
        .root_source_file = b.path("tests/hwp5/style-preservation/probe.zig"),
        .target = target,
        .optimize = optimize,
    });
    preservation_probe_module.addImport("hwpjs", core);
    const preservation_probe = b.addExecutable(.{ .name = "style-preservation-probe", .root_module = preservation_probe_module });
    const preservation_oracle = b.addSystemCommand(&.{ "node", "tests/hwp5/style-preservation/file-audit.mjs" });
    preservation_oracle.addArtifactArg(preservation_probe);
    preservation_oracle.has_side_effects = true;
    const preservation_step = b.step("style-preservation-audit", "Test experimental editable model and immutable HWP5 source preservation");
    preservation_step.dependOn(&preservation_tests.step);
    preservation_step.dependOn(&preservation_oracle.step);

    const text_tests_module = b.createModule(.{ .root_source_file = b.path("tests/hwp5/style-preservation/text.test.zig"), .target = target, .optimize = optimize });
    text_tests_module.addImport("hwpjs", core);
    const text_tests = b.addRunArtifact(b.addTest(.{ .root_module = text_tests_module, .filters = &.{"text splice"} }));
    const text_probe_module = b.createModule(.{ .root_source_file = b.path("tests/hwp5/style-preservation/text-probe.zig"), .target = target, .optimize = optimize });
    text_probe_module.addImport("hwpjs", core);
    const text_probe = b.addExecutable(.{ .name = "text-splice-probe", .root_module = text_probe_module });
    const text_oracle = b.addSystemCommand(&.{ "node", "tests/hwp5/style-preservation/text-file-audit.mjs" });
    text_oracle.addArtifactArg(text_probe);
    text_oracle.has_side_effects = true;
    const text_step = b.step("text-splice-audit", "Verify controlled text editing with real HWP fixtures and independent adversarial oracle");
    text_step.dependOn(&text_tests.step);
    text_step.dependOn(&text_oracle.step);
    // Native unit coverage must not depend on the optional Rust JSON oracle.
    core_test_step.dependOn(&text_tests.step);

    const wasm = b.addExecutable(.{
        .name = "hwpjs",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/wasm.zig"),
            .target = b.resolveTargetQuery(.{ .cpu_arch = .wasm32, .os_tag = .freestanding }),
            .optimize = optimize,
        }),
    });
    wasm.entry = .disabled;
    wasm.rdynamic = true;
    wasm.step.dependOn(&abi_check.step);
    wasm.step.dependOn(&icc_registry_check.step);
    b.installArtifact(wasm);
    preservation_oracle.step.dependOn(b.getInstallStep());
    text_oracle.step.dependOn(b.getInstallStep());

    const compare = b.addSystemCommand(&.{ "node", "tests/cfb/compare.mjs" });
    compare.step.dependOn(b.getInstallStep());
    const compare_step = b.step("compare", "Compare CFB reading against legacy JS and validate ABI contracts");
    compare_step.dependOn(&compare.step);
    const contracts = b.addSystemCommand(&.{ "node", "--test", "tests/cfb/contracts.test.mjs", "tests/cfb/adversarial.test.mjs", "tests/cfb/structured.test.mjs", "tests/cfb/exact.test.mjs", "tests/cfb/exceptions.test.mjs", "tests/cfb/writer.test.mjs" });
    contracts.step.dependOn(b.getInstallStep());
    compare_step.dependOn(&contracts.step);
    const mutations = b.addSystemCommand(&.{ "node", "tests/cfb/mutations.mjs" });
    mutations.step.dependOn(b.getInstallStep());
    const audit = b.step("audit", "Run regression contracts and deterministic malformed-input sweeps");
    const hwp5_text_api = b.addSystemCommand(&.{ "node", "--test", "tests/hwp5/text-preview.test.mjs", "tests/hwp5/preview-record-oracle.test.mjs", "tests/hwp5/canvas-preview.test.mjs" });
    hwp5_text_api.step.dependOn(b.getInstallStep());
    audit.dependOn(&hwp5_text_api.step);
    const editor_api_tests = b.addSystemCommand(&.{ "node", "--test", "--test-concurrency=1", "tests/hwp5/editor.test.mjs", "tests/hwp5/editor-controls.test.mjs", "tests/hwp5/history-controls.test.mjs", "tests/hwp5/history-editor.test.mjs", "tests/hwp5/history-abi.test.mjs", "tests/hwp5/canvas-edit.test.mjs", "tests/hwp5/canvas-editor.test.mjs", "tests/hwp5/document-save.test.mjs", "tests/hwp5/edit-corpus.test.mjs", "tests/hwp5/nested-editor.test.mjs", "tests/hwp5/empty-editor.test.mjs", "tests/hwp5/control-editor.test.mjs", "tests/hwp5/reader-worker.test.mjs" });
    editor_api_tests.addArg("tests/hwp5/structure-editor.test.mjs");
    editor_api_tests.addArg("tests/hwp5/character-property-disclosure.test.mjs");
    editor_api_tests.addArg("tests/hwp5/numeric-formula-corpus.test.mjs");
    editor_api_tests.addArg("tests/hwp5/formula-definition-editor.test.mjs");
    editor_api_tests.addArg("tests/hwp5/formula-worker-definition.test.mjs");
    editor_api_tests.addArg("tests/hwp5/document-numbering.test.mjs");
    editor_api_tests.step.dependOn(b.getInstallStep());
    editor_api_tests.addArg("tests/hwp5/normalized-open.test.mjs");
    editor_api_tests.addArg("tests/hwp5/normalized-distribution.test.mjs");
    editor_api_tests.addArg("tests/hwp5/normalization-abi.test.mjs");
    editor_api_tests.addArg("tests/hwp5/normalization-worker-abi.test.mjs");
    editor_api_tests.addArg("tests/hwp5/table-number-source-oracle.test.mjs");
    editor_api_tests.addArg("tests/hwp5/table-number-character-format.test.mjs");
    editor_api_tests.addArg("tests/hwp5/table-number-format-canvas.test.mjs");
    editor_api_tests.addArg("tests/hwp5/selected-table-number-text.test.mjs");
    editor_api_tests.addArg("tests/hwp5/selected-table-number-canvas.test.mjs");
    editor_api_tests.addArg("tests/hwp5/unselected-table-number-text.test.mjs");
    editor_api_tests.addArg("tests/hwp5/object-number-text.test.mjs");
    editor_api_tests.addArg("tests/hwp5/object-number-canvas.test.mjs");
    editor_api_tests.addArg("tests/hwp5/field-spans-wire.test.mjs");
    editor_api_tests.addArg("tests/hwp5/field-spans-editor.test.mjs");
    editor_api_tests.addArg("tests/hwp5/field-spans-oracle.test.mjs");
    editor_api_tests.addArg("tests/hwp5/field-spans-abi.test.mjs");
    editor_api_tests.addArg("tests/hwp5/field-topology-wire.test.mjs");
    editor_api_tests.addArg("tests/hwp5/field-topology-api.test.mjs");
    editor_api_tests.addArg("tests/hwp5/field-topology-window.test.mjs");
    editor_api_tests.addArg("tests/hwp5/field-topology-window-worker.test.mjs");
    editor_api_tests.addArg("tests/hwp5/document-editor-access.test.mjs");
    editor_api_tests.addArg("tests/hwp5/field-spans-readable.test.mjs");
    editor_api_tests.addArg("tests/hwp5/revision-sign-text.test.mjs");
    editor_api_tests.addArg("tests/hwp5/revision-sign-negative.test.mjs");
    editor_api_tests.addArg("tests/hwp5/window-source-policy.test.mjs");
    editor_api_tests.addArg("tests/hwp5/flow-host-editor.test.mjs");
    editor_api_tests.addArg("tests/hwp5/column-sources-editor.test.mjs");
    editor_api_tests.addArg("tests/hwp5/window-query-worker.test.mjs");
    editor_api_tests.addArg("tests/hwp5/window-selection.test.mjs");
    editor_api_tests.addArg("tests/hwp5/window-canvas-harness.test.mjs");
    editor_api_tests.addArg("tests/hwp5/window-page-layout.test.mjs");
    editor_api_tests.addArg("tests/hwp5/window-canvas-fallback.test.mjs");
    editor_api_tests.addArg("tests/hwp5/window-app-readiness.test.mjs");
    editor_api_tests.addArg("tests/hwp5/late-window-roundtrip.test.mjs");
    editor_api_tests.addArg("tests/hwp5/late-window-canvas.test.mjs");
    editor_api_tests.addArg("tests/hwp5/table-content.test.mjs");
    editor_api_tests.addArg("tests/hwp5/table-content-index.test.mjs");
    editor_api_tests.addArg("tests/hwp5/browser-input-origin.test.mjs");
    editor_api_tests.addArg("tests/hwpx/document-window-controls.test.mjs");
    editor_api_tests.addArg("tests/hwp5/field-window-dependencies.test.mjs");
    editor_api_tests.addArg("tests/hwp5/column-window-dependencies.test.mjs");
    editor_api_tests.addArg("tests/hwp5/repeated-window-dependencies.test.mjs");
    editor_api_tests.addArg("tests/hwp5/window-table-sources.test.mjs");
    editor_api_tests.addArg("tests/hwp5/window-note-content.test.mjs");
    editor_api_tests.addArg("tests/hwp5/window-drawing-content.test.mjs");
    editor_api_tests.addArg("tests/hwp5/window-object-content.test.mjs");
    editor_api_tests.addArg("tests/hwp5/window-picture-content.test.mjs");
    editor_api_tests.addArg("tests/hwp5/window-repeated-content.test.mjs");
    editor_api_tests.addArg("tests/hwp5/browser-click-target.test.mjs");
    editor_api_tests.addArg("tests/hwp5/browser-session-close.test.mjs");
    editor_api_tests.addArg("tests/hwp5/audit-jsonl-output.test.mjs");
    editor_api_tests.addArg("tests/hwp5/audit-reader-output-cli.test.mjs");
    editor_api_tests.addArg("tests/hwp5/reference-browser-arguments.test.mjs");
    installedArtifactEnvironment(editor_api_tests, "HWPJS_TEST_WASM", "hwpjs.wasm");
    editor_api_tests.addArg("tests/hwp5/text-source-policy-content.test.mjs");
    editor_api_tests.addArg("tests/hwp5/text-source-policy-api.test.mjs");
    editor_api_tests.addArg("tests/hwp5/text-source-protection.test.mjs");
    editor_api_tests.addArg("tests/hwp5/retained-click-policy.test.mjs");
    editor_api_tests.addArg("tests/hwp5/retained-click-worker.test.mjs");
    editor_api_tests.addArg("tests/hwp5/retained-click-roundtrip.test.mjs");
    editor_api_tests.addArg("tests/hwp5/normalization-consent.test.mjs");
    editor_api_tests.addArg("tests/hwp5/normalized-worker.test.mjs");
    editor_api_tests.addArg("tests/hwp5/normalized-distribution-worker.test.mjs");
    editor_api_tests.addArg("tests/hwp5/form-source-retention.test.mjs");
    editor_api_tests.addArg("tests/hwp5/form-source-worker.test.mjs");
    editor_api_tests.addArg("tests/hwp5/form-token-boundaries.test.mjs");
    editor_api_tests.addArg("tests/hwp5/object-metadata-numeric-retention.test.mjs");
    editor_api_tests.addArg("tests/hwp5/unselected-field-sections.test.mjs");
    editor_api_tests.addArg("tests/hwp5/unselected-cross-reference-gate.test.mjs");
    editor_api_tests.addArg("tests/hwp5/reference-range-prefix.test.mjs");
    editor_api_tests.addArg("tests/hwp5/onsaemiro-range-prefix.test.mjs");
    editor_api_tests.addArg("tests/hwp5/disjoint-range-marker.test.mjs");
    editor_api_tests.addArg("tests/hwp5/disjoint-range-suffix.test.mjs");
    editor_api_tests.has_side_effects = true;
    audit.dependOn(&editor_api_tests.step);
    const editor_api_step = b.step("hwp5-editor-audit", "Test experimental JS WASM HWP5 editor boundary");
    editor_api_step.dependOn(&editor_api_tests.step);
    const ownership_parity = b.addSystemCommand(&.{ "node", "--test", "--test-concurrency=1", "tests/hwp5/ownership-index-query-parity.test.mjs" });
    installedArtifactEnvironment(ownership_parity, "HWPJS_TEST_WASM", "hwpjs.wasm");
    ownership_parity.step.dependOn(b.getInstallStep());
    ownership_parity.has_side_effects = true;
    const ownership_parity_step = b.step("hwp5-ownership-query-parity", "Compare HWP5 ownership queries against an explicit baseline WASM");
    ownership_parity_step.dependOn(&ownership_parity.step);
    const formula_query_parity = b.addSystemCommand(&.{ "node", "--test", "--test-concurrency=1", "tests/hwpx/formula-result-worker-parity.test.mjs" });
    installedArtifactEnvironment(formula_query_parity, "HWPJS_TEST_WASM", "hwpjs.wasm");
    formula_query_parity.step.dependOn(b.getInstallStep());
    formula_query_parity.has_side_effects = true;
    const formula_query_parity_step = b.step("hwpx-formula-query-parity", "Compare HWPX display queries against an explicit baseline WASM");
    formula_query_parity_step.dependOn(&formula_query_parity.step);
    const hwpx_text_tests = b.addSystemCommand(&.{ "node", "--test", "tests/hwpx/text-reader.test.mjs", "tests/hwpx/canvas-preview.test.mjs", "tests/hwpx/editor.test.mjs", "tests/hwpx/formula-editor.test.mjs", "tests/hwpx/note-editor.test.mjs", "tests/hwpx/anchor-editor.test.mjs", "tests/hwpx/header-footer-editor.test.mjs", "tests/hwpx/object-boundary-editor.test.mjs", "tests/hwpx/history-editor.test.mjs" });
    hwpx_text_tests.addArg("tests/hwpx/created-cell-xml.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/formula-result-paragraphs.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/formula-result-paragraph-api.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/memo-label.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/title-field-prefix.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/plain-prefix-empty-run.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/unknown-object-anchor.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/unknown-object-anchor-canvas.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/chart-numeric-input-corpus.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/oracle-process-async.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/plain-fixture-audit-arguments.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/document-menu-controls.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/document-ribbon-controls.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/document-ribbon-browser.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/edit-audit-options.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/document-menu-disclosures.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/document-menu-keyboard.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/document-menu-mnemonic.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/document-menu-mnemonic-boundary.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/document-menu-browser-arguments.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/fixture-request-lifetime.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/anchor-empty-run-oracle.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/document-menu-command-registry.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/document-menu-popup-layer.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/document-menu-wiring.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/document-menu-gate-registration.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/title-field-canvas.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/title-field-browser-arguments.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/reference-field-audit-arguments.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/memo-browser-arguments.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/memo-label-canvas.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/field-query-publication.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/nested-field-reference.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/nested-field-canvas.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/picture-owners-reference.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/picture-owners-history.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/picture-owners-wire.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/picture-owner-batch-content.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/dutmal-text-editor.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/dutmal-text-worker.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/dutmal-sites.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/inline-string-source-wire.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/inline-string-source-reference.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/dutmal-edge-publication.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/dutmal-anchor-reference.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/dutmal-renderer-worker.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/created-cell-softline-canvas.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/created-source-table-host.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/created-source-scene-worker.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/source-table-control-coverage.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/numeric-input-corpus.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/numeric-exact-corpus.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/grouped-integer-editor.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/formula-definition-corpus.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/formula-worker.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/formula-average-split-policy.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/formula-average-split-worker.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/query-parity-arguments.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/guarded-query-worker.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/manual-formula-result-editor.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/manual-formula-result-worker.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/manual-formula-result-edge.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/manual-formula-result-splice.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/manual-formula-result-targets.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/manual-formula-result-text-worker.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/manual-formula-result-exterior.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/manual-formula-dependency-preservation.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/created-table-formula-host.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/manual-result-oracle-section.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/chart-text-census.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/bookmark-field-reference.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/field-end-exterior-reference.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/field-exterior-inline-reference.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/markpen-display-axis.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/markpen-source-reference.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/markpen-source-canvas.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/run-markpen-source-reference.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/section-metadata-input-reference.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/section-metadata-canvas.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/runless-paragraph-worker.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/table-creation-worker.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/field-range-capability.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/chart-current-editor.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/chart-string-editor.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/chart-string-api-boundary.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/chart-ole-policy-boundary.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/chart-baseline-parity.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/chart-series-text-editor.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/chart-series-text-wire.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/chart-series-text-boundary.test.mjs");
    hwpx_text_tests.addArg("tests/hwpx/chart-shared-representation.test.mjs");
    hwpx_text_tests.addArg("tests/wasm/export-parity.test.mjs");
    hwpx_text_tests.step.dependOn(b.getInstallStep());
    hwpx_text_tests.has_side_effects = true;
    audit.dependOn(&hwpx_text_tests.step);
    const hwpx_text_step = b.step("hwpx-text-audit", "Test public HWPX section event transport");
    hwpx_text_step.dependOn(&hwpx_text_tests.step);
    const note_number_oracle = b.addSystemCommand(&.{ "node", "--test", "tests/hwp5/note-number-links.test.mjs" });
    audit.dependOn(&note_number_oracle.step);
    audit.dependOn(&mutations.step);
    audit.dependOn(core_test_step);
    audit.dependOn(compare_step);
    const wmf_framing_tests = b.addSystemCommand(&.{ "node", "--test", "tests/hwp5/wmf-framing-evidence.test.mjs" });
    audit.dependOn(&wmf_framing_tests.step);
    const png_post_iend_tests = b.addSystemCommand(&.{ "node", "--test", "tests/hwp5/png-post-iend-evidence.test.mjs" });
    audit.dependOn(&png_post_iend_tests.step);
    const chart_fixture = b.addSystemCommand(&.{ "node", "tests/hwp5/chart-observed-fixture.mjs" });
    // Recheck the corpus and JS oracle on every invocation, not a stale
    // captured stdout result whose external read dependencies are invisible.
    chart_fixture.has_side_effects = true;
    chart_fixture.step.dependOn(b.getInstallStep());
    const chart_ownership_module = b.createModule(.{
        .root_source_file = b.path("tests/hwp5/chart-observed-ownership.zig"),
        .target = target,
        .optimize = optimize,
    });
    chart_ownership_module.addImport("hwpjs", core);
    chart_ownership_module.addImport("chart_fixture", b.createModule(.{
        .root_source_file = chart_fixture.captureStdOut(.{ .basename = "chart-fixture.zig" }),
        .target = target,
        .optimize = optimize,
    }));
    const chart_ownership = b.addRunArtifact(b.addTest(.{ .root_module = chart_ownership_module }));
    const chart_ownership_step = b.step("chart-ownership-audit", "Verify selected Contents ownership using a hash-pinned corpus fixture");
    chart_ownership_step.dependOn(&chart_ownership.step);
    const chart_fixture_tests = b.addSystemCommand(&.{ "node", "--test", "tests/hwp5/chart-native-fixture-module.test.mjs" });
    chart_ownership_step.dependOn(&chart_fixture_tests.step);
    audit.dependOn(chart_ownership_step);
    const wmf_fixture = b.addSystemCommand(&.{ "node", "tests/hwp5/wmf-contents-fixture.mjs" });
    wmf_fixture.has_side_effects = true;
    wmf_fixture.step.dependOn(b.getInstallStep());
    const wmf_ownership_module = b.createModule(.{
        .root_source_file = b.path("tests/hwp5/wmf-contents-ownership.zig"),
        .target = target,
        .optimize = optimize,
    });
    wmf_ownership_module.addImport("hwpjs", core);
    wmf_ownership_module.addImport("wmf_fixture", b.createModule(.{
        .root_source_file = wmf_fixture.captureStdOut(.{ .basename = "wmf-fixture.zig" }),
        .target = target,
        .optimize = optimize,
    }));
    const wmf_ownership = b.addRunArtifact(b.addTest(.{ .root_module = wmf_ownership_module }));
    const wmf_ownership_step = b.step("wmf-contents-audit", "Verify the HWP OLE placeable WMF Contents header");
    wmf_ownership_step.dependOn(&wmf_ownership.step);
    audit.dependOn(wmf_ownership_step);
    const icc_registry_tests = b.addSystemCommand(&.{ "node", "--test", "tools/icc-registry/csv.test.mjs", "tools/icc-registry/download.test.mjs", "tools/icc-registry/snapshot.test.mjs", "tools/icc-registry/generate.test.mjs" });
    icc_registry_tests.step.dependOn(&icc_registry_check.step);
    const icc_registry_audit = b.step("icc-registry-audit", "Verify offline ICC registry snapshot and generation contracts");
    icc_registry_audit.dependOn(&icc_registry_tests.step);
    audit.dependOn(icc_registry_audit);

    const line_cache_tests = b.addSystemCommand(&.{ "node", "--test", "tests/hwp5/line-cache-evidence.test.mjs", "tests/hwp5/line-cache-coordinate-evidence.test.mjs" });
    const line_cache_survey = b.addSystemCommand(&.{ "node", "tests/hwp5/line-cache-survey.mjs" });
    line_cache_survey.step.dependOn(b.getInstallStep());
    const line_cache_audit = b.step("line-cache-audit", "Verify merged paragraph line-cache evidence and malformed-input tests");
    line_cache_audit.dependOn(&line_cache_tests.step);
    line_cache_audit.dependOn(&line_cache_survey.step);
    audit.dependOn(line_cache_audit);

    const preview_image_tests = b.addSystemCommand(&.{ "node", "--test", "tests/hwp5/preview-image-evidence.test.mjs" });
    preview_image_tests.step.dependOn(b.getInstallStep());
    const preview_image_survey = b.addSystemCommand(&.{ "node", "tests/hwp5/preview-image-survey.mjs" });
    preview_image_survey.step.dependOn(b.getInstallStep());
    const preview_image_audit = b.step("preview-image-audit", "Read-only PrvImage corpus evidence and adversarial survey tests");
    preview_image_audit.dependOn(&preview_image_tests.step);
    preview_image_audit.dependOn(&preview_image_survey.step);
    audit.dependOn(preview_image_audit);
    const doc_options_tests = b.addSystemCommand(&.{ "node", "--test", "tests/hwp5/doc-options-evidence.test.mjs", "tests/hwp5/hwp-corpus-evidence.test.mjs" });
    doc_options_tests.step.dependOn(b.getInstallStep());
    const doc_options_survey = b.addSystemCommand(&.{ "node", "tests/hwp5/doc-options-survey.mjs" });
    doc_options_survey.step.dependOn(b.getInstallStep());
    const doc_options_audit = b.step("doc-options-audit", "Read-only DocOptions corpus evidence and malformed snapshot tests");
    doc_options_audit.dependOn(&doc_options_tests.step);
    doc_options_audit.dependOn(&doc_options_survey.step);
    audit.dependOn(doc_options_audit);

    const history_xml_tests = b.addSystemCommand(&.{ "node", "--test", "tests/hwp5/history-xml-query.test.mjs" });
    audit.dependOn(&history_xml_tests.step);
    const history_xml_survey = b.addSystemCommand(&.{ "node", "tests/hwp5/history-xml-survey.mjs" });
    history_xml_survey.step.dependOn(b.getInstallStep());
    const history_xml_audit = b.step("history-xml-audit", "Read-only history XML evidence (requires xmllint; not a product XML parser)");
    history_xml_audit.dependOn(&history_xml_tests.step);
    history_xml_audit.dependOn(&history_xml_survey.step);

    const hwp_probe = b.addExecutable(.{
        .name = "hwp5-probe",
        .root_module = b.createModule(.{
            .root_source_file = b.path("tests/hwp5/probe.zig"),
            .target = wasm.root_module.resolved_target.?,
            .optimize = optimize,
        }),
    });
    hwp_probe.root_module.addImport("hwpjs", b.createModule(.{
        .root_source_file = b.path("src/root.zig"),
        .target = wasm.root_module.resolved_target.?,
        .optimize = optimize,
    }));
    hwp_probe.entry = .disabled;
    hwp_probe.step.dependOn(&icc_registry_check.step);
    hwp_probe.rdynamic = true;
    const install_hwp_probe = b.addInstallArtifact(hwp_probe, .{});
    const hwp_check = b.addSystemCommand(&.{ "node", "tests/hwp5/audit.mjs" });
    hwp_check.step.dependOn(&note_number_oracle.step);
    const drawing_evidence_tests = b.addSystemCommand(&.{ "node", "--test", "tests/hwp5/drawing-section-evidence.test.mjs", "tests/hwp5/ole-paired-evidence.test.mjs" });
    hwp_check.step.dependOn(&drawing_evidence_tests.step);
    hwp_check.addArtifactArg(hwp_probe);
    hwp_check.step.dependOn(b.getInstallStep());
    b.step("hwp5-audit", "Verify HWP5 foundation in WASM against independent byte oracles").dependOn(&hwp_check.step);
    audit.dependOn(&hwp_check.step);

    const emf_corpus_tests = b.addSystemCommand(&.{ "node", "--test", "tests/hwp5/emf-corpus.test.mjs", "tests/hwp5/emf-corpus-artifacts.test.mjs" });
    installedArtifactEnvironment(emf_corpus_tests, "HWPJS_TEST_WASM", "hwpjs.wasm");
    installedArtifactEnvironment(emf_corpus_tests, "HWPJS_TEST_HWP5_PROBE", "hwp5-probe.wasm");
    emf_corpus_tests.step.dependOn(b.getInstallStep());
    emf_corpus_tests.step.dependOn(&install_hwp_probe.step);
    const emf_corpus_survey = b.addSystemCommand(&.{ "node", "tests/hwp5/emf-corpus-survey.mjs" });
    emf_corpus_survey.addArtifactArg(wasm);
    emf_corpus_survey.addArtifactArg(hwp_probe);
    const emf_corpus_audit = b.step("emf-corpus-audit", "Extract HWP BinData and validate embedded EMF with record coverage evidence");
    emf_corpus_audit.dependOn(&emf_corpus_tests.step);
    emf_corpus_audit.dependOn(&emf_corpus_survey.step);
    audit.dependOn(emf_corpus_audit);
}

// Installation paths are resolved by the 0.17 executor, after configuration.
// Pass the lazy path as an argument rather than guessing --prefix/--bin-dir.
fn installedArtifactEnvironment(run: *std.Build.Step.Run, key: []const u8, basename: []const u8) void {
    const b = run.step.owner;
    const path = b.graph.path(.install_bin, basename);
    path.addStepDependencies(&run.step);
    run.argv.insertSlice(b.allocator, 0, &.{
        .{ .bytes = "node" },
        .{ .lazy_path = .{ .prefix = "", .suffix = "", .lazy_path = b.path("tools/run-with-artifact-env.mjs"), .make_absolute = true } },
        .{ .bytes = key },
        .{ .lazy_path = .{ .prefix = "", .suffix = "", .lazy_path = path, .make_absolute = true } },
    }) catch @panic("OOM");
}
