#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const to_json_1 = require("./commands/to-json");
const to_markdown_1 = require("./commands/to-markdown");
const to_html_1 = require("./commands/to-html");
const to_pdf_1 = require("./commands/to-pdf");
const info_1 = require("./commands/info");
const extract_images_1 = require("./commands/extract-images");
const batch_1 = require("./commands/batch");
const program = new commander_1.Command();
program.name('hwpjs').description('HWP file parser CLI').version('0.1.0-rc.4');
// Register commands
(0, to_json_1.toJsonCommand)(program);
(0, to_markdown_1.toMarkdownCommand)(program);
(0, to_html_1.toHtmlCommand)(program);
(0, to_pdf_1.toPdfCommand)(program);
(0, info_1.infoCommand)(program);
(0, extract_images_1.extractImagesCommand)(program);
(0, batch_1.batchCommand)(program);
program.parse();
