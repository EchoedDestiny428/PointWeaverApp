import { useState, useRef, useMemo, useEffect } from 'react';
import type { PathDefinition, SimulatedPose } from '../types';
import { computeGroupTotals, findNextHeadingIndex, smoothstep } from '../utils/math';

export function usePlayback(currentPath: PathDefinition) {
  const [playbackState, setPlaybackState] = useState<'stopped' | 'playing' | 'paused'>('stopped');
  const animationRef = useRef<number | null>(null);
  const playbackTimeRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);

  const computedTrajectory = useMemo(() => {
    const points = currentPath.points || [];
    const trajectory: SimulatedPose[] = [];
    if (points.length === 0) return trajectory;

    let currX = points[0].x;
    let currY = points[0].y;
    let currTheta = points[0].theta ?? 0;

    let t = 0;
    trajectory.push({ t, x: currX, y: currY, theta: currTheta });

    if (points.length === 1) return trajectory;

    const groupTotals = computeGroupTotals(points);
    const dt = 0.02; // 50Hz simulation
    const PathMoveKp = 1.0;
    const PathPosTolerance = 0.05;
    const defaultMaxSpeed = 3.0; // Assume 3m/s default top speed

    let lastTheta = points[0].theta ?? 0;

    for (let i = 1; i < points.length; i++) {
      const targetPoint = points[i];
      let maxSpeed = targetPoint.params?.maxSpeed ?? currentPath.params?.maxSpeed ?? defaultMaxSpeed;
      if (isNaN(maxSpeed)) maxSpeed = defaultMaxSpeed;
      let minSpeed = targetPoint.params?.minSpeed ?? currentPath.params?.minSpeed ?? 0.0;
      if (isNaN(minSpeed)) minSpeed = 0.0;
      let earlyExit = targetPoint.params?.earlyExitRange ?? currentPath.params?.earlyExitRange ?? PathPosTolerance;
      if (isNaN(earlyExit)) earlyExit = PathPosTolerance;
      const interpolate = targetPoint.params?.interpolate ?? currentPath.params?.interpolate ?? false;

      let prevIdx = i - 1;
      let nextHeadingIdx = findNextHeadingIndex(points, prevIdx);
      let groupTotal = groupTotals[prevIdx];

      let loopCount = 0;
      const MAX_LOOPS = 10000;

      while (true) {
        loopCount++;
        if (loopCount > MAX_LOOPS) {
          console.warn("Path simulation infinite loop detected! Breaking early.");
          break;
        }

        let dist = Math.hypot(targetPoint.x - currX, targetPoint.y - currY);
        // Ensure earlyExit is at least 0.01 to prevent floating point overshoots
        let effectiveEarlyExit = Math.max(0.01, earlyExit);
        
        if (dist <= effectiveEarlyExit) {
          if (targetPoint.theta != null) {
            lastTheta = targetPoint.theta;
            currTheta = lastTheta;
          }
          break;
        }

        let speed = dist * PathMoveKp;
        let clampedSpeed = Math.max(minSpeed, Math.min(maxSpeed, speed));
        if (isNaN(clampedSpeed) || clampedSpeed < 1e-3) clampedSpeed = 1e-3; // prevent infinite loops

        let dx = (targetPoint.x - currX) / dist;
        let dy = (targetPoint.y - currY) / dist;

        currX += dx * clampedSpeed * dt;
        currY += dy * clampedSpeed * dt;

        if (nextHeadingIdx !== -1 && !isNaN(groupTotal) && interpolate) {
          let targetForDist = points[nextHeadingIdx];
          let remainingDist = Math.hypot(targetForDist.x - currX, targetForDist.y - currY);
          let rawProgress = Math.max(0, Math.min(1.0, 1.0 - (remainingDist / groupTotal)));
          let progress = smoothstep(rawProgress);

          let t1 = lastTheta;
          let t2 = targetForDist.theta!;
          let dTheta = t2 - t1;
          if (dTheta > 180) dTheta -= 360;
          if (dTheta < -180) dTheta += 360;
          currTheta = t1 + dTheta * progress;
        } else if (targetPoint.theta != null) {
          currTheta = targetPoint.theta;
        }

        t += dt;
        trajectory.push({ t, x: currX, y: currY, theta: currTheta });
      }
    }

    return trajectory;
  }, [currentPath]);

  const getTotalPathTime = () => {
    if (computedTrajectory.length === 0) return 0;
    return computedTrajectory[computedTrajectory.length - 1].t;
  };

  const getInterpolatedPose = (t: number) => {
    if (computedTrajectory.length === 0) return null;
    if (t <= computedTrajectory[0].t) return computedTrajectory[0];
    if (t >= computedTrajectory[computedTrajectory.length - 1].t) return computedTrajectory[computedTrajectory.length - 1];

    let low = 0;
    let high = computedTrajectory.length - 1;
    while (low <= high) {
      let mid = Math.floor((low + high) / 2);
      if (computedTrajectory[mid].t === t) return computedTrajectory[mid];
      if (computedTrajectory[mid].t < t) low = mid + 1;
      else high = mid - 1;
    }

    const p1 = computedTrajectory[high];
    const p2 = computedTrajectory[low];
    const dt = p2.t - p1.t;
    if (dt <= 0) return p1;

    const frac = (t - p1.t) / dt;
    let newTheta = p1.theta + (p2.theta - p1.theta) * frac;
    if (Math.abs(p2.theta - p1.theta) > 180) {
      let d = p2.theta - p1.theta;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      newTheta = p1.theta + d * frac;
    }

    return {
      t,
      x: p1.x + (p2.x - p1.x) * frac,
      y: p1.y + (p2.y - p1.y) * frac,
      theta: newTheta
    };
  };

  const drawCanvasRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const loop = (time: number) => {
      if (playbackState === 'playing') {
        const dt = (time - lastTickRef.current) / 1000;
        playbackTimeRef.current += dt;
        if (playbackTimeRef.current > getTotalPathTime()) {
          playbackTimeRef.current = 0; // Loop back to start
        }
      }
      lastTickRef.current = time;

      if (drawCanvasRef.current) drawCanvasRef.current();

      animationRef.current = requestAnimationFrame(loop);
    };

    lastTickRef.current = performance.now();
    animationRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    };
  }, [playbackState, computedTrajectory]);

  const playPause = () => {
    if (playbackState === 'playing') setPlaybackState('paused');
    else if (playbackState === 'paused' || playbackState === 'stopped') {
      if (playbackState === 'stopped') playbackTimeRef.current = 0;
      setPlaybackState('playing');
    }
  };

  const stopPlayback = () => {
    setPlaybackState('stopped');
    playbackTimeRef.current = 0;
    if (drawCanvasRef.current) drawCanvasRef.current();
  };

  return {
    playbackState, setPlaybackState,
    playbackTimeRef,
    computedTrajectory,
    getTotalPathTime,
    getInterpolatedPose,
    playPause, stopPlayback,
    drawCanvasRef
  };
}
