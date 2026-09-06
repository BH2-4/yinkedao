/**
 * R3F 印面叠层 + GLTFExporter 导出 spike（自动流程，无人工交互）。
 *
 * 流程：GLTFLoader 加载 seal.glb → Box3 包围盒定位印面 → 叠 plane
 *   （cell-r0c0.png 占位贴图）→ 渲染稳定 → GLTFExporter binary 导出
 *   → POST /exported 回本地 server 落盘。
 *
 * 页面状态灯（供无头验证断言）：
 *   #l1 组件挂载  #l2 glb+贴图加载  #l3 叠层完成  #l4 导出+上传完成
 *
 * 设计取舍：
 *   - 灯光手动配（drei <Environment preset> 要从 CDN 拉 HDRI，
 *     无头浏览器不走系统代理会挂）
 *   - 印面定位用包围盒底面 + 手调常量（demo 级；生产每个 glb 配参数）
 */
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

const mark = (id: string, ok: boolean, text: string) => {
  const el = document.getElementById(id);
  if (el) { el.textContent = text; el.className = ok ? "ok" : "err"; }
};

function SealScene() {
  const gltf = useLoader(GLTFLoader, "/seal.glb");
  const faceTex = useLoader(THREE.TextureLoader, "/cell-r0c0.png");
  const groupRef = useRef<THREE.Group>(null);
  const [phase, setPhase] = useState<"loaded" | "overlaid" | "done">("loaded");

  useEffect(() => {
    if (phase !== "loaded" || !groupRef.current) return;
    const model = gltf.scene;

    /* 印面 plane：包围盒底面，尺寸取水平短边 70%，贴图透明 */
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const planeW = Math.min(size.x, size.z) * 0.7;

    const tex = faceTex as THREE.Texture;
    tex.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(planeW, planeW),
      new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        roughness: 0.65,
        metalness: 0.05,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(
      box.min.x + size.x / 2,
      box.min.y + size.y * 0.02 + 0.002,
      box.min.z + size.z / 2,
    );
    plane.name = "seal-face-overlay";
    model.add(plane);

    mark("l3", true, `✓ 叠层完成：plane ${(planeW).toFixed(1)} 单位 @ y=${plane.position.y.toFixed(2)}`);
    setPhase("overlaid");
  }, [phase, gltf, faceTex]);

  useEffect(() => {
    if (phase !== "overlaid" || !groupRef.current) return;
    /* 渲染稳定后导出（等 2s 让首帧 + 材质就绪） */
    const timer = setTimeout(async () => {
      try {
        const exporter = new GLTFExporter();
        const group = groupRef.current!;
        const result = await exporter.parseAsync(group, { binary: true }) as ArrayBuffer;
        const bytes = result.byteLength;
        mark("l4", true, `✓ 导出 ${(bytes / 1048576).toFixed(1)} MB，上传中…`);
        const res = await fetch("/exported", {
          method: "POST",
          headers: { "content-type": "application/octet-stream", "x-reported-size": String(bytes) },
          body: result,
        });
        if (!res.ok) throw new Error(`server ${res.status}`);
        const j = await res.json() as { savedBytes: number };
        mark("l4", true, `✓ 导出+落盘完成：${(j.savedBytes / 1048576).toFixed(1)} MB（源 52.9MB）`);
        setPhase("done");
        document.title = "SPIKE-DONE";
      } catch (e) {
        mark("l4", false, `✗ 导出/上传失败：${String(e)}`);
        document.title = "SPIKE-ERR";
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [phase]);

  return (
    <group ref={groupRef}>
      <primitive object={gltf.scene} />
      {/* 手动灯光：方向光 + 环境光 + 补光（避开 drei Environment 的 CDN HDRI） */}
      <ambientLight intensity={0.65} />
      <directionalLight position={[5, 8, 5]} intensity={1.6} />
      <directionalLight position={[-6, 3, -4]} intensity={0.5} />
    </group>
  );
}

function App() {
  useEffect(() => { mark("l1", true, "✓ R3F Canvas 挂载"); }, []);
  return (
    <>
      <Canvas camera={{ position: [3.2, 2.4, 3.6], fov: 42 }} dpr={[1, 1]}>
        <color attach="background" args={["#e8e6e0"]} />
        <SealScene />
        <OrbitControls />
      </Canvas>
      <div id="log">
        <div id="l1">· 挂载中…</div>
        <div id="l2">· 加载 seal.glb（52.9MB）+ 占位贴图…</div>
        <div id="l3">· 叠层待命</div>
        <div id="l4">· 导出待命</div>
      </div>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
mark("l2", true, "✓ loader 解析完成（进入渲染）");
