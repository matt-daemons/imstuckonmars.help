"use client";

import { useEffect, useRef } from "react";
import "./listening-effect.css";

const vertex = `attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;
const fragment = `precision mediump float;
uniform vec2 resolution;
uniform float time;
void main() {
  vec2 pixel = gl_FragCoord.xy;
  vec2 edge = min(pixel, resolution - pixel);
  float distance = min(edge.x, edge.y);
  float wave = 0.5 + 0.5 * sin(pixel.x * 0.012 + pixel.y * 0.009 - time * 1.4);
  float alpha = (1.0 - smoothstep(1.0, 10.0, distance)) * (0.35 + wave * 0.4);
  gl_FragColor = vec4(0.2, 0.84, 0.85, alpha);
}`;

/** A recording indicator only. The static border remains if WebGL or motion is unavailable. */
export function ListeningEffect({ active }: { active: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!active || !canvas.current) return;
    const element = canvas.current;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const gl = element.getContext("webgl", { alpha: true, premultipliedAlpha: false });
    if (!gl) return;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
      gl.deleteShader(shader);
      return null;
    };
    const vs = compile(gl.VERTEX_SHADER, vertex);
    const fs = compile(gl.FRAGMENT_SHADER, fragment);
    const program = gl.createProgram();
    if (!vs || !fs || !program) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      if (program) gl.deleteProgram(program);
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return;
    }
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.useProgram(program);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const resolution = gl.getUniformLocation(program, "resolution");
    const time = gl.getUniformLocation(program, "time");
    let frame = 0;
    const draw = (timestamp: number) => {
      const width = Math.max(1, element.clientWidth);
      const height = Math.max(1, element.clientHeight);
      if (element.width !== width || element.height !== height) {
        element.width = width;
        element.height = height;
      }
      gl.viewport(0, 0, element.width, element.height);
      gl.uniform2f(resolution, element.width, element.height);
      gl.uniform1f(time, motion.matches ? 0 : timestamp / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (!motion.matches && !document.hidden) frame = requestAnimationFrame(draw);
    };
    const restart = () => {
      cancelAnimationFrame(frame);
      draw(performance.now());
    };
    restart();
    window.addEventListener("resize", restart);
    motion.addEventListener("change", restart);
    document.addEventListener("visibilitychange", restart);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", restart);
      motion.removeEventListener("change", restart);
      document.removeEventListener("visibilitychange", restart);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [active]);
  return active ? (
    <div className="lara-listening-edge" aria-hidden>
      <canvas ref={canvas} />
    </div>
  ) : null;
}
