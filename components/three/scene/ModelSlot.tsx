"use client";

// Loading a .glb with a primitive fallback, in one place because four things now
// want it: the cowboy, his stool, the table pedestal and the guns on the felt.
import { Component, Suspense, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

// An uncaught throw inside a Canvas blanks the whole table, not one object, so a
// missing or corrupt file has to be caught rather than allowed to propagate.
class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn("[table] model failed to load, falling back to primitives", err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

// `enabled` off, file missing, or file still loading — all three land on the same
// primitives, so the table is always a playable table.
export function ModelSlot({
  enabled,
  fallback,
  children,
}: {
  enabled?: boolean;
  fallback: ReactNode;
  children: ReactNode;
}) {
  if (!enabled) return <>{fallback}</>;
  return (
    <Boundary fallback={fallback}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </Boundary>
  );
}

export function Model({
  url,
  scale,
  position,
  rotation,
  retint,
}: {
  url: string;
  scale?: number | [number, number, number];
  position?: [number, number, number];
  rotation?: [number, number, number];
  retint?: Record<string, string>; // material name -> replacement colour
}) {
  const { scene } = useGLTF(url);
  // Cloned per instance: seven stools share one loaded file but must not share one
  // scene node.
  const obj = useMemo(() => scene.clone(true), [scene]);
  useEffect(() => {
    // Materials are shared with the loaded scene, so a recoloured one must be cloned
    // first or every other user of this file changes colour too.
    const own: THREE.Material[] = [];
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      if (!retint || Array.isArray(m.material)) return;
      const hex = retint[m.material.name];
      if (!hex) return;
      const c = (m.material as THREE.MeshStandardMaterial).clone();
      c.color.set(hex);
      m.material = c;
      own.push(c);
    });
    return () => own.forEach((m) => m.dispose());
  }, [obj, retint]);
  return <primitive object={obj} scale={scale} position={position} rotation={rotation} />;
}
