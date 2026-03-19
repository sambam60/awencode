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

export function resolveSetiKey(name: string): string {
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

export function SetiIcon({
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

export function FolderIcon({ open, size = 16 }: { open: boolean; size?: number }) {
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
