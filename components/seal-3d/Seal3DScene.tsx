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
  /** 章石 glb 主地址（blob 公开 URL） */
  glbUrl: string;
  /** 章石 glb 兜底地址（本地缓存路径——blob 偶发中断时回退） */
  glbFallbackUrl?: string;
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

/* ─── 姿态校正（立板章料 → 印面朝天） ─────────────────────────
 * Meshy 从六宫格照片重建的章料常呈「立板」姿态：最薄轴才是印面
 * 法向（实测 X 厚 0.444 / Y 1.882 / Z 1.903），印面端面顶点密度
 * 远高于背面（建模侧重视角的高密度细分）。检测两信号后旋转对齐
 * Y+，印面朝上——钤印语义与「正视印面」视角都建立在这个姿态上。
 */

/** 密度带容差：厚度方向的 8%（端面顶点落在这个带内） */
const DENSITY_BAND = 0.08;

/** 检测最薄轴（印面法向）与高密度端（真印面侧）。 */
function detectFaceSide(model: THREE.Object3D): {
  axis: "x" | "y" | "z";
  atMax: boolean;
} {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  const dims = [
    { axis: "x" as const, len: size.x },
    { axis: "y" as const, len: size.y },
    { axis: "z" as const, len: size.z },
  ].sort((a, b) => a.len - b.len);
  const thin = dims[0];

  /* 采样顶点（隔 3 取 1，4 万级顶点毫秒完成），统计两端密度带内数量 */
  let nearMax = 0;
  let nearMin = 0;
  const eps = thin.len * DENSITY_BAND;
  const v = new THREE.Vector3();
  model.updateWorldMatrix(true, true);
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry?.attributes?.position;
    if (!pos) return;
    for (let i = 0; i < pos.count; i += 3) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const coord = v[thin.axis];
      if (Math.abs(coord - box.max[thin.axis]) < eps) nearMax += 1;
      else if (Math.abs(coord - box.min[thin.axis]) < eps) nearMin += 1;
    }
  });
  return { axis: thin.axis, atMax: nearMax >= nearMin };
}

/** 姿态校正：把印面（最薄轴的高密度端）旋转到 +Y 朝天，原地改 model。 */
function orientSealUpright(model: THREE.Object3D): void {
  const { axis, atMax } = detectFaceSide(model);
  if (axis === "y") {
    if (!atMax) model.rotation.z = Math.PI; /* 印面朝下 → 翻 180° */
    return;
  }
  if (axis === "x") {
    /* X+→Y+ 用 Rz(+90°)；X-→Y+ 用 Rz(-90°) */
    model.rotation.z = atMax ? Math.PI / 2 : -Math.PI / 2;
  } else {
    /* Z+→Y+ 用 Rx(-90°)；Z-→Y+ 用 Rx(+90°) */
    model.rotation.x = atMax ? -Math.PI / 2 : Math.PI / 2;
  }
}

function SealModel({
  glbUrl,
  glbFallbackUrl,
  faceTextureUrl,
  onSceneObject,
  onRendered,
}: Omit<Seal3DSceneProps, "onError">) {
  /* 手动 fetch + parseAsync（不用 useLoader）：FileLoader 的 onError
     只给 ProgressEvent（吞掉真实错误），parseAsync 会带完整栈。
     blob 主地址失败（偶发中断）时回退本地缓存再试一次 */
  const [gltf, setGltf] = useState<GLTF | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const load = async (url: string) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        return new GLTFLoader().parseAsync(buf, "");
      };
      let parsed: GLTF;
      try {
        parsed = await load(glbUrl);
      } catch (primaryErr) {
        if (!glbFallbackUrl) throw primaryErr;
        console.warn("[3d-scene] blob 主地址失败，回退本地缓存:", primaryErr);
        parsed = await load(glbFallbackUrl);
      }
      if (alive) setGltf(parsed);
    })().catch((err: unknown) => {
      console.error("[3d-scene] glb 加载/解析失败:", err);
    });
    return () => {
      alive = false;
    };
  }, [glbUrl, glbFallbackUrl]);

  const faceTex = useLoader(THREE.TextureLoader, faceTextureUrl);
  const [composed, setComposed] = useState<THREE.Group | null>(null);

  /* eslint-disable react-hooks/immutability -- three.js 场景装配是命令式
     惯用法（纹理参数/add/transform），React Compiler 不可变规则不适用 */
  useEffect(() => {
    if (!gltf) return;
    const model = gltf.scene;

    /* 姿态校正（haiku 检验根因）：Meshy 章料常呈「立板」姿态——最薄
       轴才是印面法向（本例 X 厚 0.444，印面是 ±X 的 1.87×1.87 大面，
       密度端顶点密集 40 倍）。检测最薄轴 + 密度端 → 旋转对齐 Y+，
       印面朝天，再按顶面逻辑贴 plane。 */
    orientSealUpright(model);

    /* wrapper：章料（已旋转）+ 印面 plane 共同的导出/渲染根。
       plane 放 wrapper 局部系（无旋转），避免 model 旋转的坐标耦合。 */
    const wrapper = new THREE.Group();
    wrapper.name = "seal-composed";
    wrapper.add(model);

    const box = new THREE.Box3().setFromObject(wrapper);
    const size = new THREE.Vector3();
    box.getSize(size);
    /* 章料坐到 y=0（旋转后中心在原点，悬空） */
    wrapper.position.y = -box.min.y;
    box.translate(new THREE.Vector3(0, -box.min.y, 0));

    /* 印面 plane：贴真实顶面（姿态校正后的印面端面），尺寸取顶面
       两条实际边长的短边（不再假设竖方章 min(X,Z)） */
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
    wrapper.add(plane);

    onSceneObject?.(wrapper);
    onRendered?.();
    setComposed(wrapper);
    /* eslint-enable react-hooks/immutability */
  }, [gltf, faceTex, onSceneObject, onRendered]);

  return composed ? <primitive object={composed} /> : null;
}

/** 视角预设（top 用极小 z 偏移防万向锁） */
const VIEWS: Record<"orbit" | "top", { pos: [number, number, number]; target: [number, number, number] }> = {
  orbit: { pos: [2.4, 2.0, 3.2], target: [0, 0.4, 0] },
  top: { pos: [0, 3.2, 0.001], target: [0, 0.9, 0] },
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
      camera={{ position: [2.7, 2.3, 3.6], fov: 38 }}
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
