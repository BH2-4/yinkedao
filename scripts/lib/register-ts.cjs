// 离线脚本加载仓库 TypeScript，避免启动网页或另外安装 Python 环境。
/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS 加载钩子用于离线测试 */
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "../..");
const original = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return original.call(this, request.startsWith("@/") ? path.resolve(root, request.slice(2)) : request, ...rest);
};
require.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
