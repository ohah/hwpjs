#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const commander_1 = require("commander");
const to_json_1 = require("./commands/to-json");
const to_markdown_1 = require("./commands/to-markdown");
const to_html_1 = require("./commands/to-html");
// to-pdf 비활성화 (확장만 해둠)
// import { toPdfCommand } from './commands/to-pdf';
const info_1 = require("./commands/info");
const extract_images_1 = require("./commands/extract-images");
const batch_1 = require("./commands/batch");
const program = new commander_1.Command();
const packageJsonPath = path_1.default.join(__dirname, '../../package.json');
const version = JSON.parse((0, fs_1.readFileSync)(packageJsonPath, 'utf-8'))
    .version ?? '0.0.0';
program.name('hwpjs').description('HWP file parser CLI').version(version);
// Register commands
(0, to_json_1.toJsonCommand)(program);
(0, to_markdown_1.toMarkdownCommand)(program);
(0, to_html_1.toHtmlCommand)(program);
// toPdfCommand(program);
(0, info_1.infoCommand)(program);
(0, extract_images_1.extractImagesCommand)(program);
(0, batch_1.batchCommand)(program);
program.parse();
