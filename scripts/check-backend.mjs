import { spawnSync } from "node:child_process";

// 阻塞等待每项后端检查完成；不访问前端页面、不轮询外部服务。
for (const script of ["test-specimen-sheet.mjs", "verify-sealculture.mjs", "smoke-sealculture-trio.mjs", "test-seal-phase2.mjs", "test-3d-phase2.mjs", "test-interview-phase2.mjs"]) {
  const result = spawnSync(process.execPath, [`scripts/${script}`], {
    stdio: "inherit", windowsHide: true,
    env: { ...process.env, DEMO_MODE: "true", IMAGE_PROVIDER: "mock", MESHY_GENERATION_ENABLED: "false", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", BIGMODEL_API_KEY: "", MESHY_API_KEY: "", BLOB_READ_WRITE_TOKEN: "", OUTBOUND_PROXY_URL: "" },
  });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
