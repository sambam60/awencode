import { useEffect, useMemo, useState, useCallback, useRef, memo } from "react";
import { RefreshCw, ChevronsDownUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
  children: DirEntry[] | null;
}

interface FileStatus {
  path: string;
  status: string;
}

interface FileTreeViewProps {
  projectPath: string | null;
  projectName: string;
  branch: string;
  open: boolean;
  onClose: () => void;
}

/** Captured from the real tree row so the overlay matches indent + compressed label (VS Code aligns sticky rows to list geometry). */
interface StickyTreeInfo {
  path: string;
  depth: number;
  label: string;
}

interface VisibleTreeRow extends StickyTreeInfo {
  entry: DirEntry;
  isDir: boolean;
  parentPath: string | null;
  startIndex: number;
  endIndex: number;
}

interface StickyRenderRow extends StickyTreeInfo {
  entry: DirEntry;
  top: number;
}

const STICKY_SCROLL_MAX_ROWS = 6;

// ─── VSCode git decoration colors ────────────────────────────────────────────

const GIT_COLORS_LIGHT: Record<string, string> = {
  M: "#895503",
  A: "#587c0c",
  D: "#ad0707",
  R: "#007100",
  C: "#007100",
  U: "#73C991",
  I: "#8E8E90",
  "!": "#ad0707",
  T: "#895503",
};

const GIT_COLORS_DARK: Record<string, string> = {
  M: "#E2C08D",
  A: "#81b88b",
  D: "#c74e39",
  R: "#73C991",
  C: "#73C991",
  U: "#73C991",
  I: "#8C8C8C",
  "!": "#e4676b",
  T: "#E2C08D",
};

function useIsDarkMode(): boolean {
  const [dark, setDark] = useState(
    () => document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);
  return dark;
}

function gitColor(status: string, dark: boolean): string | undefined {
  return dark ? GIT_COLORS_DARK[status] : GIT_COLORS_LIGHT[status];
}

// ─── Status helpers ───────────────────────────────────────────────────────────

function getFileStatus(
  filePath: string,
  statusMap: Map<string, string>,
): string | null {
  return statusMap.get(filePath) ?? null;
}

function getDirStatus(
  dirPath: string,
  statusMap: Map<string, string>,
): string | null {
  const prefix = dirPath.endsWith("/") ? dirPath : `${dirPath}/`;
  for (const [p, s] of statusMap) {
    if (p.startsWith(prefix) && s !== "D") return "M";
  }
  return null;
}

// ─── Seti icon font ───────────────────────────────────────────────────────────
// Sourced directly from Cursor's bundled theme-seti extension.
// Each entry: [fontCharacter, fontColor (dark), fontColor (light)]

type SetiDef = { char: string; dark: string; light: string };

const SETI_DEFS: Record<string, SetiDef> = {
  _R:           { char: "\uE001", dark: "#519aba", light: "#498ba7" },
  _argdown:     { char: "\uE003", dark: "#519aba", light: "#498ba7" },
  _asm:         { char: "\uE004", dark: "#cc3e44", light: "#b8383d" },
  _audio:       { char: "\uE005", dark: "#a074c4", light: "#9068b0" },
  _babel:       { char: "\uE006", dark: "#cbcb41", light: "#b7b73b" },
  _bazel:       { char: "\uE007", dark: "#8dc149", light: "#7fae42" },
  _bazel_1:     { char: "\uE007", dark: "#4d5a5e", light: "#455155" },
  _bicep:       { char: "\uE008", dark: "#519aba", light: "#498ba7" },
  _bower:       { char: "\uE009", dark: "#e37933", light: "#cc6d2e" },
  _bsl:         { char: "\uE00A", dark: "#cc3e44", light: "#b8383d" },
  _c:           { char: "\uE00C", dark: "#519aba", light: "#498ba7" },
  _c_1:         { char: "\uE00C", dark: "#a074c4", light: "#9068b0" },
  _c_2:         { char: "\uE00C", dark: "#cbcb41", light: "#b7b73b" },
  "c-sharp":    { char: "\uE00B", dark: "#519aba", light: "#498ba7" },
  _cake:        { char: "\uE00D", dark: "#cc3e44", light: "#b8383d" },
  _cake_php:    { char: "\uE00E", dark: "#cc3e44", light: "#b8383d" },
  _clock:       { char: "\uE012", dark: "#519aba", light: "#498ba7" },
  _clock_1:     { char: "\uE012", dark: "#6d8086", light: "#627379" },
  _clojure:     { char: "\uE013", dark: "#8dc149", light: "#7fae42" },
  _clojure_1:   { char: "\uE013", dark: "#519aba", light: "#498ba7" },
  _config:      { char: "\uE019", dark: "#6d8086", light: "#627379" },
  _cpp:         { char: "\uE01A", dark: "#519aba", light: "#498ba7" },
  _cpp_1:       { char: "\uE01A", dark: "#a074c4", light: "#9068b0" },
  _cpp_2:       { char: "\uE01A", dark: "#cbcb41", light: "#b7b73b" },
  _crystal:     { char: "\uE01B", dark: "#d4d7d6", light: "#bfc2c1" },
  _crystal_embedded: { char: "\uE01C", dark: "#d4d7d6", light: "#bfc2c1" },
  _css:         { char: "\uE01D", dark: "#519aba", light: "#498ba7" },
  _csv:         { char: "\uE01E", dark: "#8dc149", light: "#7fae42" },
  _cu:          { char: "\uE01F", dark: "#8dc149", light: "#7fae42" },
  _cu_1:        { char: "\uE01F", dark: "#a074c4", light: "#9068b0" },
  _d:           { char: "\uE020", dark: "#cc3e44", light: "#b8383d" },
  _dart:        { char: "\uE021", dark: "#519aba", light: "#498ba7" },
  _db:          { char: "\uE022", dark: "#f55385", light: "#dd4b78" },
  _db_1:        { char: "\uE022", dark: "#519aba", light: "#498ba7" },
  _default:     { char: "\uE023", dark: "#d4d7d6", light: "#bfc2c1" },
  _docker:      { char: "\uE025", dark: "#519aba", light: "#498ba7" },
  _docker_1:    { char: "\uE025", dark: "#4d5a5e", light: "#455155" },
  _docker_2:    { char: "\uE025", dark: "#8dc149", light: "#7fae42" },
  _ejs:         { char: "\uE027", dark: "#cbcb41", light: "#b7b73b" },
  _elixir:      { char: "\uE028", dark: "#a074c4", light: "#9068b0" },
  _elixir_script: { char: "\uE029", dark: "#a074c4", light: "#9068b0" },
  _elm:         { char: "\uE02A", dark: "#519aba", light: "#498ba7" },
  _eslint:      { char: "\uE02C", dark: "#a074c4", light: "#9068b0" },
  _eslint_1:    { char: "\uE02C", dark: "#4d5a5e", light: "#455155" },
  _ethereum:    { char: "\uE02D", dark: "#519aba", light: "#498ba7" },
  _favicon:     { char: "\uE02F", dark: "#cbcb41", light: "#b7b73b" },
  _firebase:    { char: "\uE030", dark: "#e37933", light: "#cc6d2e" },
  _font:        { char: "\uE033", dark: "#cc3e44", light: "#b8383d" },
  _git:         { char: "\uE034", dark: "#41535b", light: "#3b4b52" },
  _github:      { char: "\uE037", dark: "#d4d7d6", light: "#bfc2c1" },
  _gitlab:      { char: "\uE038", dark: "#e37933", light: "#cc6d2e" },
  _go:          { char: "\uE039", dark: "#519aba", light: "#498ba7" },
  _godot:       { char: "\uE03B", dark: "#519aba", light: "#498ba7" },
  _gradle:      { char: "\uE03C", dark: "#519aba", light: "#498ba7" },
  _graphql:     { char: "\uE03E", dark: "#f55385", light: "#dd4b78" },
  _grunt:       { char: "\uE03F", dark: "#e37933", light: "#cc6d2e" },
  _gulp:        { char: "\uE040", dark: "#cc3e44", light: "#b8383d" },
  _haml:        { char: "\uE042", dark: "#cc3e44", light: "#b8383d" },
  _haskell:     { char: "\uE044", dark: "#a074c4", light: "#9068b0" },
  _haxe:        { char: "\uE045", dark: "#e37933", light: "#cc6d2e" },
  _heroku:      { char: "\uE046", dark: "#a074c4", light: "#9068b0" },
  _html:        { char: "\uE048", dark: "#519aba", light: "#498ba7" },
  _html_1:      { char: "\uE048", dark: "#8dc149", light: "#7fae42" },
  _html_2:      { char: "\uE048", dark: "#cbcb41", light: "#b7b73b" },
  _html_3:      { char: "\uE048", dark: "#e37933", light: "#cc6d2e" },
  _html_erb:    { char: "\uE049", dark: "#cc3e44", light: "#b8383d" },
  _ignored:     { char: "\uE04A", dark: "#41535b", light: "#3b4b52" },
  _illustrator: { char: "\uE04B", dark: "#cbcb41", light: "#b7b73b" },
  _image:       { char: "\uE04C", dark: "#a074c4", light: "#9068b0" },
  _info:        { char: "\uE04D", dark: "#519aba", light: "#498ba7" },
  _jade:        { char: "\uE04F", dark: "#cc3e44", light: "#b8383d" },
  _java:        { char: "\uE050", dark: "#cc3e44", light: "#b8383d" },
  _java_1:      { char: "\uE050", dark: "#519aba", light: "#498ba7" },
  _javascript:  { char: "\uE051", dark: "#cbcb41", light: "#b7b73b" },
  _javascript_1:{ char: "\uE051", dark: "#e37933", light: "#cc6d2e" },
  _javascript_2:{ char: "\uE051", dark: "#519aba", light: "#498ba7" },
  _jenkins:     { char: "\uE052", dark: "#cc3e44", light: "#b8383d" },
  _jinja:       { char: "\uE053", dark: "#cc3e44", light: "#b8383d" },
  _json:        { char: "\uE055", dark: "#cbcb41", light: "#b7b73b" },
  _json_1:      { char: "\uE055", dark: "#8dc149", light: "#7fae42" },
  _kotlin:      { char: "\uE058", dark: "#e37933", light: "#cc6d2e" },
  _less:        { char: "\uE059", dark: "#519aba", light: "#498ba7" },
  _license:     { char: "\uE05A", dark: "#cbcb41", light: "#b7b73b" },
  _license_1:   { char: "\uE05A", dark: "#e37933", light: "#cc6d2e" },
  _license_2:   { char: "\uE05A", dark: "#cc3e44", light: "#b8383d" },
  _liquid:      { char: "\uE05B", dark: "#8dc149", light: "#7fae42" },
  _lock:        { char: "\uE05D", dark: "#8dc149", light: "#7fae42" },
  _lua:         { char: "\uE05E", dark: "#519aba", light: "#498ba7" },
  _makefile:    { char: "\uE05F", dark: "#e37933", light: "#cc6d2e" },
  _makefile_3:  { char: "\uE05F", dark: "#519aba", light: "#498ba7" },
  _markdown:    { char: "\uE060", dark: "#519aba", light: "#498ba7" },
  _maven:       { char: "\uE061", dark: "#cc3e44", light: "#b8383d" },
  _mustache:    { char: "\uE063", dark: "#e37933", light: "#cc6d2e" },
  _nim:         { char: "\uE065", dark: "#cbcb41", light: "#b7b73b" },
  _notebook:    { char: "\uE066", dark: "#519aba", light: "#498ba7" },
  _npm:         { char: "\uE067", dark: "#41535b", light: "#3b4b52" },
  _npm_1:       { char: "\uE067", dark: "#cc3e44", light: "#b8383d" },
  _nunjucks:    { char: "\uE069", dark: "#8dc149", light: "#7fae42" },
  _ocaml:       { char: "\uE06A", dark: "#e37933", light: "#cc6d2e" },
  _pdf:         { char: "\uE06D", dark: "#cc3e44", light: "#b8383d" },
  _perl:        { char: "\uE06E", dark: "#519aba", light: "#498ba7" },
  _php:         { char: "\uE070", dark: "#a074c4", light: "#9068b0" },
  _prisma:      { char: "\uE075", dark: "#519aba", light: "#498ba7" },
  _python:      { char: "\uE07B", dark: "#519aba", light: "#498ba7" },
  _react:       { char: "\uE07D", dark: "#519aba", light: "#498ba7" },
  _react_1:     { char: "\uE07D", dark: "#e37933", light: "#cc6d2e" },
  _reasonml:    { char: "\uE07E", dark: "#cc3e44", light: "#b8383d" },
  _rollup:      { char: "\uE080", dark: "#cc3e44", light: "#b8383d" },
  _ruby:        { char: "\uE081", dark: "#cc3e44", light: "#b8383d" },
  _rust:        { char: "\uE082", dark: "#6d8086", light: "#627379" },
  _sass:        { char: "\uE084", dark: "#f55385", light: "#dd4b78" },
  _scala:       { char: "\uE086", dark: "#cc3e44", light: "#b8383d" },
  _shell:       { char: "\uE089", dark: "#8dc149", light: "#7fae42" },
  _svelte:      { char: "\uE090", dark: "#cc3e44", light: "#b8383d" },
  _svg:         { char: "\uE091", dark: "#a074c4", light: "#9068b0" },
  _svg_1:       { char: "\uE091", dark: "#519aba", light: "#498ba7" },
  _swift:       { char: "\uE092", dark: "#e37933", light: "#cc6d2e" },
  _terraform:   { char: "\uE093", dark: "#a074c4", light: "#9068b0" },
  _todo:        { char: "\uE096", dark: "#d4d7d6", light: "#bfc2c1" },
  _tsconfig:    { char: "\uE097", dark: "#519aba", light: "#498ba7" },
  _twig:        { char: "\uE098", dark: "#8dc149", light: "#7fae42" },
  _typescript:  { char: "\uE099", dark: "#519aba", light: "#498ba7" },
  _typescript_1:{ char: "\uE099", dark: "#e37933", light: "#cc6d2e" },
  _video:       { char: "\uE09B", dark: "#f55385", light: "#dd4b78" },
  _vite:        { char: "\uE09C", dark: "#cbcb41", light: "#b7b73b" },
  _vue:         { char: "\uE09D", dark: "#8dc149", light: "#7fae42" },
  _wasm:        { char: "\uE09E", dark: "#a074c4", light: "#9068b0" },
  _wat:         { char: "\uE09F", dark: "#a074c4", light: "#9068b0" },
  _webpack:     { char: "\uE0A0", dark: "#519aba", light: "#498ba7" },
  _word:        { char: "\uE0A3", dark: "#519aba", light: "#498ba7" },
  _xls:         { char: "\uE0A4", dark: "#8dc149", light: "#7fae42" },
  _xml:         { char: "\uE0A5", dark: "#e37933", light: "#cc6d2e" },
  _yarn:        { char: "\uE0A6", dark: "#519aba", light: "#498ba7" },
  _yml:         { char: "\uE0A7", dark: "#a074c4", light: "#9068b0" },
  _zig:         { char: "\uE0A8", dark: "#e37933", light: "#cc6d2e" },
  _zip:         { char: "\uE0A9", dark: "#cc3e44", light: "#b8383d" },
  _zip_1:       { char: "\uE0A9", dark: "#6d8086", light: "#627379" },
};

// Folder glyph: Seti uses the same default folder glyph from the font.
// Cursor renders folder icons via the file-icon-theme — we replicate with
// a simple Unicode folder character styled to match.
// Seti doesn't have per-folder-name glyphs; it uses the default folder icon.
// We use a minimal inline SVG approach for folders to keep it clean.

// ─── Extension / filename → seti icon key ────────────────────────────────────

const EXT_SETI: Record<string, string> = {
  // TypeScript
  ts: "_typescript", mts: "_typescript", cts: "_typescript",
  "d.ts": "_typescript_1", "d.mts": "_typescript_1", "d.cts": "_typescript_1",
  // JavaScript
  js: "_javascript", mjs: "_javascript", cjs: "_javascript",
  es: "_javascript", es5: "_javascript", es7: "_javascript",
  // React
  jsx: "_react", tsx: "_react_1",
  cjsx: "_react",
  // Styles
  css: "_css", "css.map": "_css",
  scss: "_sass", sass: "_sass",
  less: "_less",
  styl: "_stylus",
  sss: "_css",
  // Markup
  html: "_html", htm: "_html",
  haml: "_haml",
  slim: "_slim",
  erb: "_html_erb", "erb.html": "_html_erb", "html.erb": "_html_erb",
  jade: "_jade",
  twig: "_twig",
  mustache: "_mustache", stache: "_mustache",
  njk: "_nunjucks", nj: "_nunjucks", njs: "_nunjucks", nunj: "_nunjucks",
    nunjs: "_nunjucks", nunjucks: "_nunjucks",
  ejs: "_ejs",
  liquid: "_liquid",
  // Data
  json: "_json", jsonc: "_json", json5: "_json", cson: "_json",
  yaml: "_yml", yml: "_yml",
  toml: "_config",
  csv: "_csv",
  xml: "_xml",
  svg: "_svg",
  // Markdown
  md: "_markdown", mdx: "_markdown",
  // Rust
  rs: "_rust",
  // Python
  py: "_python", pyi: "_python",
  // Go
  go: "_go",
  // Ruby
  rb: "_ruby",
  // PHP
  php: "_php", "php.inc": "_php",
  // Java / Kotlin / Scala
  java: "_java", class: "_java_1",
  kt: "_kotlin", kts: "_kotlin",
  scala: "_scala", sbt: "_sbt",
  // C / C++ / C#
  c: "_c", h: "_c_1",
  cpp: "_cpp", cc: "_cpp", cxx: "_cpp", hpp: "_cpp_1", hxx: "_cpp_1", "h++": "_cpp_1", hh: "_cpp_1",
  cs: "_c-sharp",
  // Swift / Objective-C
  swift: "_swift",
  // Shell
  sh: "_shell", bash: "_shell", zsh: "_shell", fish: "_shell",
  // Docker
  dockerfile: "_docker",
  dockerignore: "_docker_1",
  // Terraform
  tf: "_terraform", tfvars: "_terraform", "tf.json": "_terraform", "tfvars.json": "_terraform",
  // GraphQL
  graphql: "_graphql", gql: "_graphql", graphqls: "_graphql",
  // Prisma
  prisma: "_prisma",
  // Vue / Svelte / Astro
  vue: "_vue",
  svelte: "_svelte",
  // WASM
  wasm: "_wasm", wat: "_wat",
  // Images
  png: "_image", jpg: "_image", jpeg: "_image", gif: "_image",
  webp: "_image", bmp: "_image", tiff: "_image", avif: "_image",
  ico: "_favicon", pxm: "_image", svgx: "_image",
  // Fonts
  ttf: "_font", woff: "_font", woff2: "_font", otf: "_font", eot: "_font",
  // Audio / Video
  mp3: "_audio", wav: "_audio", ogg: "_audio", flac: "_audio",
  mp4: "_video", mov: "_video", avi: "_video", mkv: "_video", webm: "_video",
  mpg: "_video", ogv: "_video",
  // Archives
  zip: "_zip_1", jar: "_zip", tar: "_zip", gz: "_zip", "7z": "_zip", rar: "_zip",
  // Certs / Keys
  pem: "_lock", crt: "_lock", cer: "_lock", cert: "_lock", key: "_lock",
  // PDF
  pdf: "_pdf",
  // Config
  env: "_config", config: "_config", direnv: "_config", htaccess: "_config",
    static: "_config", slugignore: "_config",
  // Bazel
  bazel: "_bazel", bzl: "_bazel", build: "_bazel", workspace: "_bazel",
    bazelignore: "_bazel", bazelversion: "_bazel", bazelrc: "_bazel_1",
  // Gradle
  gradle: "_gradle",
  // Haskell
  hs: "_haskell", lhs: "_haskell",
  // Elm
  elm: "_elm",
  // Elixir
  ex: "_elixir", exs: "_elixir_script",
  // Clojure
  edn: "_clojure_1",
  // OCaml
  ml: "_ocaml", mli: "_ocaml", cmx: "_ocaml", cmxa: "_ocaml",
  // Nim
  nim: "_nim", nims: "_nim",
  // Zig
  zig: "_zig",
  // Lua
  lua: "_lua",
  // Dart
  dart: "_dart",
  // Crystal
  cr: "_crystal",
  // Perl
  pl: "_perl",
  // Notebook
  ipynb: "_notebook",
  // Word / Excel
  doc: "_word", docx: "_word",
  xls: "_xls", xlsx: "_xls",
  // Vite
  "vite.config.ts": "_vite", "vite.config.js": "_vite",
  // Webpack
  "webpack.config.js": "_webpack", "webpack.config.ts": "_webpack",
};

const FILENAME_SETI: Record<string, string> = {
  // Readme / License / Changelog
  "readme.md": "_info", "readme.txt": "_info", "readme": "_info",
  "license": "_license", "license.md": "_license", "license.txt": "_license",
  "licence": "_license", "licence.md": "_license", "licence.txt": "_license",
  "copying": "_license", "copying.md": "_license", "copying.txt": "_license",
  "changelog.md": "_clock", "changelog.txt": "_clock", "changelog": "_clock",
  "changes.md": "_clock", "changes.txt": "_clock", "changes": "_clock",
  "version": "_clock", "version.md": "_clock", "version.txt": "_clock",
  "contributing": "_license_2", "contributing.md": "_license_2", "contributing.txt": "_license_2",
  "compiling": "_license_1", "compiling.md": "_license_1", "compiling.txt": "_license_1",
  "todo": "_todo", "todo.md": "_todo", "todo.txt": "_todo",
  // Git
  ".gitignore": "_git", ".gitattributes": "_git", ".gitmodules": "_git", ".gitkeep": "_git",
  ".gitconfig": "_git",
  // npm / yarn / pnpm
  "package.json": "_npm", "package-lock.json": "_npm",
  ".npmignore": "_npm_1", ".npmrc": "_npm_1", "npm-debug.log": "_npm",
  "yarn.lock": "_yarn", "yarn.clean": "_yarn",
  ".nvmrc": "_config", ".node-version": "_config",
  // ESLint
  ".eslintrc": "_eslint", ".eslintrc.js": "_eslint", ".eslintrc.cjs": "_eslint",
  ".eslintrc.mjs": "_eslint", ".eslintrc.json": "_eslint",
  ".eslintrc.yaml": "_eslint", ".eslintrc.yml": "_eslint",
  "eslint.config.js": "_eslint", ".eslintignore": "_eslint_1",
  // Prettier
  ".prettierrc": "_config", ".prettierrc.js": "_config", ".prettierrc.json": "_config",
  ".prettierrc.yaml": "_config", ".prettierrc.yml": "_config",
  "prettier.config.js": "_config", "prettier.config.cjs": "_config",
  // Babel
  ".babelrc": "_babel", ".babelrc.js": "_babel", ".babelrc.cjs": "_babel",
  "babel.config.js": "_babel", "babel.config.cjs": "_babel", "babel.config.json": "_babel",
  // TypeScript
  "tsconfig.json": "_tsconfig", "tsconfig.base.json": "_tsconfig",
  "tsconfig.build.json": "_tsconfig",
  // Vite
  "vite.config.ts": "_vite", "vite.config.js": "_vite",
  "vite.config.mts": "_vite", "vite.config.mjs": "_vite", "vite.config.cts": "_vite",
  // Webpack
  "webpack.config.js": "_webpack", "webpack.config.ts": "_webpack",
  "webpack.config.cjs": "_webpack", "webpack.config.mjs": "_webpack",
  "webpack.common.js": "_webpack", "webpack.dev.js": "_webpack", "webpack.prod.js": "_webpack",
  // Rollup
  "rollup.config.js": "_rollup", "rollup.config.ts": "_rollup",
  // Docker
  "dockerfile": "_docker", "docker-compose.yml": "_docker", "docker-compose.yaml": "_docker",
  ".dockerignore": "_docker_1", "docker-healthcheck": "_docker_2",
  // Makefile / CMake
  "makefile": "_makefile", "cmakelists.txt": "_makefile_3",
  // Bazel
  "build": "_bazel", "build.bazel": "_bazel", "workspace": "_bazel", "workspace.bazel": "_bazel",
  // Firebase
  "firebase.json": "_firebase", ".firebaserc": "_firebase",
  // Bower
  "bower.json": "_bower", ".bowerrc": "_bower",
  // Karma
  "karma.conf.js": "_config", "karma.conf.cjs": "_config", "karma.conf.mjs": "_config",
  // Grunt / Gulp
  "gruntfile.js": "_grunt", "gruntfile.babel.js": "_grunt",
  "gulpfile": "_gulp", "gulpfile.js": "_gulp",
  // Swagger
  "swagger.json": "_json_1", "swagger.yaml": "_json_1", "swagger.yml": "_json_1",
  // Heroku
  "procfile": "_heroku",
  // Maven
  "pom.xml": "_maven", "mvnw": "_maven",
  // Stylelint
  "stylelint.config.js": "_stylelint", "stylelint.config.cjs": "_stylelint",
  ".stylelintrc": "_stylelint", ".stylelintignore": "_stylelint_1",
  // Editorconfig
  ".editorconfig": "_config",
  // Env
  ".env": "_config", ".env.local": "_config", ".env.development": "_config",
  ".env.production": "_config", ".env.test": "_config",
  // Cursor
  ".cursorrules": "_config",
  // Agents
  "agents.md": "_info",
};

function resolveSetiKey(name: string): string {
  const lower = name.toLowerCase();

  // Exact filename
  if (FILENAME_SETI[lower]) return FILENAME_SETI[lower];

  // Compound extension (e.g. d.ts, test.ts, spec.tsx)
  const firstDot = lower.indexOf(".");
  if (firstDot >= 0) {
    const compound = lower.slice(firstDot + 1);
    if (EXT_SETI[compound]) return EXT_SETI[compound];
    // Simple extension
    const lastDot = lower.lastIndexOf(".");
    const ext = lower.slice(lastDot + 1);
    if (EXT_SETI[ext]) return EXT_SETI[ext];
  }

  return "_default";
}

// ─── Seti icon glyph component ───────────────────────────────────────────────

function SetiIcon({
  iconKey,
  isDark,
  size = 16,
}: {
  iconKey: string;
  isDark: boolean;
  size?: number;
}) {
  const def = SETI_DEFS[iconKey] ?? SETI_DEFS["_default"];
  const color = isDark ? def.dark : def.light;
  return (
    <span
      aria-hidden
      style={{
        fontFamily: "seti",
        fontSize: size,
        // Seti glyphs can have descenders/ascenders that don't fit cleanly
        // into a strict 1:1 line box; loosen it to avoid clipping.
        lineHeight: 1.15,
        color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        overflow: "visible",
        textAlign: "center",
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {def.char}
    </span>
  );
}

// ─── Folder icon ─────────────────────────────────────────────────────────────
// Seti doesn't have per-folder-name glyphs. We use minimal inline SVGs that
// match Cursor's default folder appearance.

function FolderIcon({ open, size = 16 }: { open: boolean; size?: number }) {
  const color = "#90a4ae";
  if (open) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M1.5 3.5C1.5 2.67 2.17 2 3 2h3.17c.35 0 .68.13.93.37L8.5 3.75H13c.83 0 1.5.67 1.5 1.5v1H1.5V3.5z"
          fill={color}
        />
        <path
          d="M1 6.25h14l-1.5 7H2.5L1 6.25z"
          fill={color}
          opacity="0.85"
        />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M1.5 3.5C1.5 2.67 2.17 2 3 2h3.17c.35 0 .68.13.93.37L8.5 3.75H13c.83 0 1.5.67 1.5 1.5v7.25c0 .83-.67 1.5-1.5 1.5H3c-.83 0-1.5-.67-1.5-1.5V3.5z"
        fill={color}
      />
    </svg>
  );
}

// ─── Path compression ─────────────────────────────────────────────────────────

interface CompressedEntry {
  segments: DirEntry[];
  label: string;
  entry: DirEntry;
}

function compressTree(entries: DirEntry[]): CompressedEntry[] {
  return entries.map((e) => compress(e, [e]));
}

function compress(entry: DirEntry, segments: DirEntry[]): CompressedEntry {
  if (
    entry.isDir &&
    entry.children &&
    entry.children.length === 1 &&
    entry.children[0].isDir
  ) {
    return compress(entry.children[0], [...segments, entry.children[0]]);
  }
  return { segments, label: segments.map((s) => s.name).join(" / "), entry };
}

function buildVisibleRows(
  entries: CompressedEntry[],
  expandedDirs: Set<string>,
): VisibleTreeRow[] {
  const rows: VisibleTreeRow[] = [];

  const walk = (
    items: CompressedEntry[],
    depth: number,
    parentPath: string | null,
  ) => {
    for (const compressed of items) {
      const { entry, label } = compressed;
      const startIndex = rows.length;
      const row: VisibleTreeRow = {
        entry,
        path: entry.path,
        depth,
        label,
        isDir: entry.isDir,
        parentPath,
        startIndex,
        endIndex: startIndex,
      };
      rows.push(row);

      if (entry.isDir && expandedDirs.has(entry.path) && entry.children?.length) {
        walk(compressTree(entry.children), depth + 1, entry.path);
        row.endIndex = rows.length - 1;
      }
    }
  };

  walk(entries, 0, null);
  return rows;
}

function getAncestorUnderPrevious(
  rowMap: Map<string, VisibleTreeRow>,
  node: VisibleTreeRow,
  previousAncestorPath?: string,
): VisibleTreeRow | undefined {
  let current = node;
  let parent = current.parentPath ? rowMap.get(current.parentPath) : undefined;

  while (parent) {
    if (parent.path === previousAncestorPath) {
      return current;
    }
    current = parent;
    parent = current.parentPath ? rowMap.get(current.parentPath) : undefined;
  }

  if (previousAncestorPath === undefined) {
    return current;
  }

  return undefined;
}

function rowTop(index: number, scrollTop: number): number {
  return index * ROW_HEIGHT - scrollTop;
}

function calculateStickyRowTop(
  row: VisibleTreeRow,
  stickyRowPositionTop: number,
  scrollTop: number,
): number {
  const bottomOfLastChild = rowTop(row.endIndex, scrollTop) + ROW_HEIGHT;

  if (
    stickyRowPositionTop + ROW_HEIGHT > bottomOfLastChild &&
    stickyRowPositionTop <= bottomOfLastChild
  ) {
    return bottomOfLastChild - ROW_HEIGHT;
  }

  return stickyRowPositionTop;
}

function buildStickyRows(
  visibleRows: VisibleTreeRow[],
  rowMap: Map<string, VisibleTreeRow>,
  scrollTop: number,
): StickyRenderRow[] {
  if (scrollTop <= 0 || visibleRows.length === 0) {
    return [];
  }

  const firstVisibleIndex = Math.min(
    visibleRows.length - 1,
    Math.max(0, Math.floor(scrollTop / ROW_HEIGHT)),
  );

  const stickyRows: StickyRenderRow[] = [];
  let firstVisibleUnderWidgetIndex = firstVisibleIndex;
  let stickyRowsHeight = 0;
  let previousStickyPath: string | undefined;

  while (
    stickyRows.length < STICKY_SCROLL_MAX_ROWS &&
    firstVisibleUnderWidgetIndex < visibleRows.length
  ) {
    const firstVisibleNode = visibleRows[firstVisibleUnderWidgetIndex];
    const nextStickyNode = getAncestorUnderPrevious(
      rowMap,
      firstVisibleNode,
      previousStickyPath,
    );
    if (!nextStickyNode) {
      break;
    }

    if (nextStickyNode.path === firstVisibleNode.path) {
      const isUncollapsedParent =
        nextStickyNode.isDir && nextStickyNode.endIndex > nextStickyNode.startIndex;
      const nodeTopAlignsWithStickyBottom =
        Math.abs(
          scrollTop - (nextStickyNode.startIndex * ROW_HEIGHT - stickyRowsHeight),
        ) < 0.5;

      if (!isUncollapsedParent || nodeTopAlignsWithStickyBottom) {
        break;
      }
    }

    const top = calculateStickyRowTop(nextStickyNode, stickyRowsHeight, scrollTop);
    stickyRows.push({
      entry: nextStickyNode.entry,
      path: nextStickyNode.path,
      depth: nextStickyNode.depth,
      label: nextStickyNode.label,
      top,
    });

    stickyRowsHeight += ROW_HEIGHT;
    previousStickyPath = nextStickyNode.path;

    const nextHeight = scrollTop + top + ROW_HEIGHT;
    const nextIndex = Math.min(
      visibleRows.length - 1,
      Math.max(0, Math.floor(nextHeight / ROW_HEIGHT)),
    );

    if (nextIndex <= firstVisibleUnderWidgetIndex) {
      break;
    }

    firstVisibleUnderWidgetIndex = nextIndex;
  }

  return stickyRows;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ROW_HEIGHT = 22;
const INDENT_PX = 8;
const TWISTIE_WIDTH = 16;
const ICON_WIDTH = 16;
const ICON_GAP = 4;

// ─── Tree row ────────────────────────────────────────────────────────────────

const TreeRow = memo(function TreeRow({
  compressed,
  depth,
  statusMap,
  expandedDirs,
  onToggleDir,
  onLoadChildren,
  projectPath,
  searchQuery,
  isDark,
  selectedPath,
  onSelect,
  isLastChild,
}: {
  compressed: CompressedEntry;
  depth: number;
  statusMap: Map<string, string>;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  onLoadChildren: (path: string) => Promise<DirEntry[]>;
  projectPath: string;
  searchQuery: string;
  isDark: boolean;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  isLastChild?: boolean;
}) {
  const { entry, label } = compressed;
  const isExpanded = expandedDirs.has(entry.path);

  const status = entry.isDir
    ? getDirStatus(entry.path, statusMap)
    : getFileStatus(entry.path, statusMap);
  const color = status ? gitColor(status, isDark) : undefined;
  const isDeleted = status === "D";
  const isSelected = selectedPath === entry.path;

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    const nameMatch = label.toLowerCase().includes(q);
    if (entry.isDir) {
      const childMatch = entry.children?.some((c) =>
        c.name.toLowerCase().includes(q),
      );
      if (!nameMatch && !childMatch) return null;
    } else if (!nameMatch) {
      return null;
    }
  }

  const handleClick = async () => {
    onSelect(entry.path);
    if (entry.isDir) {
      if (!isExpanded && (!entry.children || entry.children.length === 0)) {
        await onLoadChildren(entry.path);
      }
      onToggleDir(entry.path);
    }
  };

  const paddingLeft = INDENT_PX + depth * TWISTIE_WIDTH;
  const guides = Array.from({ length: depth }, (_, i) => {
    return INDENT_PX + i * TWISTIE_WIDTH + TWISTIE_WIDTH / 2;
  });

  const iconKey = entry.isDir ? null : resolveSetiKey(entry.name);
  const children =
    entry.isDir && isExpanded && entry.children
      ? compressTree(entry.children)
      : null;

  return (
    <>
      <div
        role="treeitem"
        aria-expanded={entry.isDir ? isExpanded : undefined}
        tabIndex={0}
        data-tree-node="1"
        data-tree-is-dir={entry.isDir ? "1" : "0"}
        data-tree-depth={depth}
        data-tree-path={entry.path}
        data-tree-label={entry.isDir ? label : ""}
        data-tree-last={isLastChild ? "1" : "0"}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
          if (e.key === "ArrowRight" && entry.isDir && !isExpanded) {
            e.preventDefault();
            handleClick();
          }
          if (e.key === "ArrowLeft" && entry.isDir && isExpanded) {
            e.preventDefault();
            onToggleDir(entry.path);
          }
        }}
        className={cn(
          "relative flex items-center min-w-0 cursor-pointer select-none outline-none",
          "hover:bg-[rgba(0,0,0,0.04)] dark:hover:bg-[rgba(255,255,255,0.04)]",
          "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-blue)] focus-visible:-outline-offset-1",
          isSelected && "bg-[rgba(0,0,0,0.06)] dark:bg-[rgba(255,255,255,0.06)]",
        )}
        style={{
          minHeight: ROW_HEIGHT,
          paddingLeft,
          paddingRight: 20,
          overflow: "visible",
        }}
      >
        {/* Vertical guide lines only */}
        {guides.map((left) => (
          <span
            key={left}
            aria-hidden
            style={{
              position: "absolute",
              left,
              top: 0,
              bottom: 0,
              width: 1,
              background: "var(--border-light)",
              pointerEvents: "none",
            }}
          />
        ))}

        {/* Twistie */}
        <span
          className="flex items-center justify-center shrink-0 text-text-tertiary"
          style={{ width: TWISTIE_WIDTH, height: ROW_HEIGHT }}
        >
          {entry.isDir && (
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="currentColor"
              style={{
                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.1s ease",
              }}
            >
              <path d="M3 2l4 3-4 3V2z" />
            </svg>
          )}
        </span>

        {/* Icon */}
        <span
          className="flex items-center justify-center shrink-0"
          style={{ width: ICON_WIDTH, marginRight: ICON_GAP, overflow: "visible" }}
        >
          {entry.isDir ? (
            <FolderIcon open={isExpanded} size={15} />
          ) : (
            <SetiIcon iconKey={iconKey!} isDark={isDark} size={15} />
          )}
        </span>

        {/* Label */}
        <span
          className={cn(
            "text-[13px] truncate flex-1",
            isDeleted && "line-through opacity-70",
            !color && "text-text-primary",
          )}
          style={color ? { color, lineHeight: `${ROW_HEIGHT}px` } : { lineHeight: `${ROW_HEIGHT}px` }}
        >
          {label}
        </span>

        {/* Git status badge */}
        {status && (
          <span
            className="font-mono text-[11px] shrink-0 ml-2"
            style={{ color, minWidth: 14, textAlign: "right" }}
          >
            {status}
          </span>
        )}
      </div>

      {/* Children */}
      {children && (
        <div role="group">
          {children.map((child, idx) => (
            <TreeRow
              key={child.entry.path}
              compressed={child}
              depth={depth + 1}
              statusMap={statusMap}
              expandedDirs={expandedDirs}
              onToggleDir={onToggleDir}
              onLoadChildren={onLoadChildren}
              projectPath={projectPath}
              searchQuery={searchQuery}
              isDark={isDark}
              selectedPath={selectedPath}
              onSelect={onSelect}
              isLastChild={idx === children.length - 1}
            />
          ))}
        </div>
      )}
    </>
  );
});

// ─── Main FileTreeView ────────────────────────────────────────────────────────

export function FileTreeView({
  projectPath,
  projectName,
  branch,
  open,
  onClose: _onClose,
}: FileTreeViewProps) {
  const [tree, setTree] = useState<DirEntry[]>([]);
  const [statusMap, setStatusMap] = useState<Map<string, string>>(new Map());
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const searchQuery = "";
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const treeScrollRef = useRef<HTMLDivElement>(null);
  const isDark = useIsDarkMode();
  const [scrollTop, setScrollTop] = useState(0);

  const loadTree = useCallback(async () => {
    if (!projectPath) return;
    setLoading(true);
    try {
      const [entries, statuses] = await Promise.all([
        invoke<DirEntry[]>("list_directory_tree", {
          path: projectPath,
          depth: 3,
        }),
        invoke<FileStatus[]>("get_git_file_status", { path: projectPath }),
      ]);
      setTree(entries);
      const map = new Map<string, string>();
      for (const s of statuses) map.set(s.path, s.status);
      setStatusMap(map);
    } catch (err) {
      console.error("Failed to load file tree:", err);
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    if (open && projectPath) loadTree();
  }, [open, projectPath, loadTree]);

  const handleToggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedDirs(new Set());
    const treeScroll = treeScrollRef.current;
    if (treeScroll) {
      treeScroll.scrollTop = 0;
    }
    setScrollTop(0);
  }, []);

  const handleLoadChildren = useCallback(
    async (dirPath: string): Promise<DirEntry[]> => {
      if (!projectPath) return [];
      try {
        const fullPath = `${projectPath}/${dirPath}`;
        const children = await invoke<DirEntry[]>("list_directory_tree", {
          path: fullPath,
          depth: 2,
        });
        const prefixed = children.map((c) => ({
          ...c,
          path: `${dirPath}/${c.name}`,
          children:
            c.children?.map((gc) => ({
              ...gc,
              path: `${dirPath}/${c.name}/${gc.name}`,
              children:
                gc.children?.map((ggc) => ({
                  ...ggc,
                  path: `${dirPath}/${c.name}/${gc.name}/${ggc.name}`,
                })) ?? null,
            })) ?? null,
        }));
        setTree((prev) => updateTreeChildren(prev, dirPath, prefixed));
        return prefixed;
      } catch {
        return [];
      }
    },
    [projectPath],
  );

  const compressed = useMemo(() => compressTree(tree), [tree]);
  const visibleRows = useMemo(
    () => buildVisibleRows(compressed, expandedDirs),
    [compressed, expandedDirs],
  );
  const visibleRowMap = useMemo(
    () => new Map(visibleRows.map((row) => [row.path, row])),
    [visibleRows],
  );
  const stickyRows = useMemo(
    () => buildStickyRows(visibleRows, visibleRowMap, scrollTop),
    [visibleRows, visibleRowMap, scrollTop],
  );
  if (!open) return null;

  const displayName = projectName || projectPath?.split("/").pop() || "Project";

  return (
    <div
      ref={panelRef}
      className="h-full flex flex-col border-r border-border-light select-none"
      style={{ width: 260, minWidth: 200, maxWidth: 400, background: "var(--bg-secondary)" }}
    >
      {/* Header */}
      <div className="h-[22px] shrink-0 flex items-center pl-[20px] pr-[4px] group/header">
        <div className="flex items-center min-w-0 gap-[10px] flex-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-secondary truncate">
            {displayName}
          </span>
          {branch && (
            <div className="flex items-center gap-[8px] shrink-0">
              <span
                aria-hidden
                className="w-[5px] h-[5px] rounded-full"
                style={{ background: "var(--text-tertiary)", opacity: 0.55 }}
              />
              <span
                className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-tertiary truncate"
                title={branch}
              >
                {branch}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-0 opacity-0 group-hover/header:opacity-100 transition-opacity duration-100">
          <button
            onClick={collapseAll}
            className="w-[22px] h-[22px] flex items-center justify-center rounded hover:bg-bg-primary/60 transition-colors duration-100 cursor-pointer"
            title="Collapse Folders in Explorer"
            aria-label="Collapse Folders in Explorer"
          >
            <ChevronsDownUp size={14} className="text-text-secondary" />
          </button>
          <button
            onClick={loadTree}
            className="w-[22px] h-[22px] flex items-center justify-center rounded hover:bg-bg-primary/60 transition-colors duration-100 cursor-pointer"
            title="Refresh Explorer"
            aria-label="Refresh Explorer"
          >
            <RefreshCw
              size={14}
              className={cn("text-text-secondary", loading && "animate-spin")}
            />
          </button>
        </div>
      </div>

      {/* Tree: sticky overlay + overflow clip so negative topPx can slide the strip (VS Code StickyScrollWidget). */}
      <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
        <div
          ref={treeScrollRef}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
          role="tree"
          aria-label="File Explorer"
        >
          {loading && tree.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw size={16} className="text-text-faint animate-spin" />
            </div>
          ) : tree.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 gap-2">
              <FolderIcon open={false} size={24} />
              <span className="text-[12px] text-text-faint text-center">
                No files found.
              </span>
            </div>
          ) : (
            compressed.map((child, idx) => (
              <TreeRow
                key={child.entry.path}
                compressed={child}
                depth={0}
                statusMap={statusMap}
                expandedDirs={expandedDirs}
                onToggleDir={handleToggleDir}
                onLoadChildren={handleLoadChildren}
                projectPath={projectPath!}
                searchQuery={searchQuery}
                isDark={isDark}
                selectedPath={selectedPath}
                onSelect={setSelectedPath}
                isLastChild={idx === compressed.length - 1}
              />
            ))
          )}
        </div>

        {stickyRows.length > 0 && (
          <div
            className="pointer-events-none absolute left-0 right-0 top-0 z-20"
            style={{ height: stickyRows.length * ROW_HEIGHT }}
          >
            {stickyRows.map((row, index) => {
              return (
                <div
                  key={row.path}
                  data-sticky-row
                  className="absolute left-0 right-0"
                  style={{
                    top: row.top,
                    height: ROW_HEIGHT,
                    zIndex: stickyRows.length - index,
                  }}
                >
                  <StickyFolderRow
                    entry={row.entry}
                    label={row.label}
                    depth={row.depth}
                    isDark={isDark}
                    statusMap={statusMap}
                    expandedDirs={expandedDirs}
                    onToggleDir={handleToggleDir}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sticky folder row ────────────────────────────────────────────────────────

function StickyFolderRow({
  entry,
  label,
  depth,
  isDark,
  statusMap,
  expandedDirs,
  onToggleDir,
}: {
  entry: DirEntry;
  label: string;
  depth: number;
  isDark: boolean;
  statusMap: Map<string, string>;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
}) {
  const isExpanded = expandedDirs.has(entry.path);
  const status = getDirStatus(entry.path, statusMap);
  const color = status ? gitColor(status, isDark) : undefined;
  const paddingLeft = INDENT_PX + depth * TWISTIE_WIDTH;
  const guides = Array.from({ length: depth }, (_, i) => {
    return INDENT_PX + i * TWISTIE_WIDTH + TWISTIE_WIDTH / 2;
  });

  return (
    <div
      className="pointer-events-auto relative flex min-w-0 cursor-pointer select-none border-b border-border-light"
      style={{
        minHeight: ROW_HEIGHT,
        paddingLeft,
        paddingRight: 20,
        background: "var(--bg-secondary)",
      }}
      onClick={() => onToggleDir(entry.path)}
    >
      {guides.map((left) => (
        <span
          key={left}
          aria-hidden
          style={{
            position: "absolute",
            left,
            top: 0,
            bottom: 0,
            width: 1,
            background: "var(--border-light)",
            pointerEvents: "none",
          }}
        />
      ))}
      <span
        className="flex items-center justify-center shrink-0 text-text-tertiary"
        style={{ width: TWISTIE_WIDTH, height: ROW_HEIGHT }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="currentColor"
          style={{
            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.1s ease",
          }}
        >
          <path d="M3 2l4 3-4 3V2z" />
        </svg>
      </span>
      <span
        className="flex items-center justify-center shrink-0"
        style={{ width: ICON_WIDTH, height: ROW_HEIGHT, marginRight: ICON_GAP }}
      >
        <FolderIcon open={isExpanded} size={15} />
      </span>
      <span
        className="text-[13px] truncate flex-1 min-w-0"
        style={color ? { color, lineHeight: `${ROW_HEIGHT}px` } : { lineHeight: `${ROW_HEIGHT}px` }}
      >
        {label}
      </span>
      {status && (
        <span
          className="font-mono text-[11px] shrink-0 ml-2"
          style={{ color, minWidth: 14, textAlign: "right" }}
        >
          {status}
        </span>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function updateTreeChildren(
  tree: DirEntry[],
  targetPath: string,
  children: DirEntry[],
): DirEntry[] {
  return tree.map((entry) => {
    if (entry.path === targetPath) return { ...entry, children };
    if (entry.isDir && entry.children && targetPath.startsWith(`${entry.path}/`)) {
      return { ...entry, children: updateTreeChildren(entry.children, targetPath, children) };
    }
    return entry;
  });
}
