"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/**
 * 3D 合成场景（B 线 · 印面叠字）：章石 glb + 崇曦印面贴图 plane。
 *
 * 以 spike overlay/entry.tsx（已验证）为基础的 R3F 生产版：
 *   - GLTFLoader 加载 blob URL（vercel blob 公开桶 CORS 通）
 *   - Box3 包围盒 → 顶面自动定位印面 plane（竖立方章顶平面）
 *   - plane 尺寸 = 水平短边 × 0.7（spike 同参——印面留石边）
 *   - 贴图用镜像版：从印面正上方看是反字，钤印/从法向看是正字
 *     （钤印逻辑——用户最初需求「角度调正的篆字文印效果图」）
 *   - 灯光手动配（drei Environment 要拉 CDN HDRI，无代理环境会挂）
 *   - OrbitControls 手动挂载（不引 drei，依赖最小化）
 *
 * 架构铁律（PRD 8.1）落实：Meshy 只出石料，印面文字走字体引擎贴图
 * 后期叠加——本组件就是「文字层」在 3D 管线上的挂载点。
 */

export interface Seal3DSceneProps {
  /** 章石 glb（blob 公开 URL） */
  glbUrl: string;
  /** 印面贴图（镜像版 PNG 的公开路径） */
  faceTextureUrl: string;
  /** 场景对象就绪回调（导出 GLB 用——把含印面的 scene 树交给外层） */
  onSceneObject?: (scene: THREE.Group) => void;
  /** 渲染完成回调（进度遮罩撤除） */
  onRendered?: () => void;
  /** 交互提示（加载失败回调） */
  onError?: (message: string) => void;
  /** 视角预设：orbit 全景 / top 正俯印面（钤印方向） */
  view?: "orbit" | "top";
}

/** 印面 plane 占顶面比例（spike 验证值：印面四周留石边） */
const FACE_RATIO = 0.7;
/** 印面相对顶面的抬升（防 z-fighting） */
const FACE_LIFT = 0.004;

function SealModel({
  glbUrl,
  faceTextureUrl,
  onSceneObject,
  onRendered,
}: Omit<Seal3DSceneProps, "onError">) {
  /* 手动 fetch + parseAsync（不用 useLoader）：FileLoader 的 onError
     只给 ProgressEvent（吞掉真实错误），parseAsync 会带完整栈 */
  const [gltf, setGltf] = useState<GLTF | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch(glbUrl);
      if (!res.ok) throw new Error(`glb 拉取失败 HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const loader = new GLTFLoader();
      const parsed = await loader.parseAsync(buf, "");
      if (alive) setGltf(parsed);
    })().catch((err: unknown) => {
      console.error("[3d-scene] glb 加载/解析失败:", err);
    });
    return () => {
      alive = false;
    };
  }, [glbUrl]);

  const faceTex = useLoader(THREE.TextureLoader, faceTextureUrl);
  const groupRef = useRef<THREE.Group>(null);

  /* eslint-disable react-hooks/immutability -- three.js 场景装配是命令式
     惯用法（纹理参数/add/transform），React Compiler 不可变规则不适用 */
  useEffect(() => {
    if (!gltf || !groupRef.current) return;
    const model = gltf.scene;

    /* 印面 plane：包围盒顶面居中（spike 方案的顶面版）
       只叠一次——faceTextureUrl 切换时重建（key 由外层控制） */
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const planeW = Math.min(size.x, size.z) * FACE_RATIO;
    const center = new THREE.Vector3();
    box.getCenter(center);

    const tex = faceTex as THREE.Texture;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;

    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(planeW, planeW),
      new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        alphaTest: 0.05,
        roughness: 0.62,
        metalness: 0.04,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );
    /* 放平贴顶面：法向 +Y；从上往下看贴图保持贴图原样（镜像版→反字）
       —— 同上：Mesh 构造后设变换是 three 惯用法，豁免编译器规则 */
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(center.x, box.max.y + FACE_LIFT * size.y, center.z);
    plane.name = "seal-face-overlay";
    model.add(plane);

    onSceneObject?.(model);
    onRendered?.();
    /* eslint-enable react-hooks/immutability */
  }, [gltf, faceTex, onSceneObject, onRendered]);

  return (
    <group ref={groupRef}>
      {gltf && <primitive object={gltf.scene} />}
    </group>
  );
}

/** 视角预设（top 用极小 z 偏移防万向锁） */
const VIEWS: Record<"orbit" | "top", { pos: [number, number, number]; target: [number, number, number] }> = {
  orbit: { pos: [2.4, 2.0, 3.2], target: [0, 0.4, 0] },
  top: { pos: [0, 3.4, 0.001], target: [0, 0.5, 0] },
};

/** 手动挂载 OrbitControls（依赖最小化，不引 drei）；响应视角预设 */
function Controls({ view }: { view: "orbit" | "top" }) {
  const { camera, gl } = useThree();
  const controlsRef = useRef<OrbitControls | null>(null);

  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.2;
    controls.maxDistance = 12;
    controls.maxPolarAngle = Math.PI * 0.98;
    controlsRef.current = controls;
    return () => {
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, gl]);

  useEffect(() => {
    const preset = VIEWS[view];
    camera.position.set(...preset.pos);
    controlsRef.current?.target.set(...preset.target);
    controlsRef.current?.update();
  }, [view, camera]);

  return null;
}

export function Seal3DScene(props: Seal3DSceneProps) {
  /* 贴图切换时强制重建印面 plane（useLoader 缓存 texture，组件级 key 换树） */
  const modelKey = useMemo(() => props.faceTextureUrl, [props.faceTextureUrl]);

  return (
    <Canvas
      camera={{ position: [2.4, 2.0, 3.2], fov: 40 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, preserveDrawingBuffer: true }}
      style={{ background: "#e8e6e0" }}
    >
      <ambientLight intensity={1.1} />
      <directionalLight position={[5, 9, 6]} intensity={2.2} />
      <directionalLight position={[-6, 4, -5]} intensity={0.7} />
      <Suspense fallback={null}>
      <SealModel
        key={modelKey}
        glbUrl={props.glbUrl}
        faceTextureUrl={props.faceTextureUrl}
        onSceneObject={props.onSceneObject}
        onRendered={props.onRendered}
      />
      </Suspense>
      <Controls view={props.view ?? "orbit"} />
    </Canvas>
  );
}
