import { useState, useCallback } from 'react';
import type { PathDefinition, PathPoint } from '../types';

export function usePathEditor(projectDir: string | null) {
  const [paths, setPaths] = useState<{ name: string, content: PathDefinition }[]>([]);
  const [currentPathName, setCurrentPathName] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(new Set());

  const [history, setHistory] = useState<{ past: { points: PathPoint[] }[], future: { points: PathPoint[] }[] }>({ past: [], future: [] });

  const currentPath: PathDefinition = paths.find(p => p.name === currentPathName)?.content || { points: [], params: null };

  const pushToHistory = useCallback((force = false) => {
    setHistory(prev => {
      const past = [...prev.past];
      const maxHistory = 50;

      if (!force && past.length > 0) {
        return prev;
      }

      past.push({ points: JSON.parse(JSON.stringify(currentPath.points || [])) });
      if (past.length > maxHistory) past.shift();

      return { past, future: [] };
    });
  }, [currentPath.points]);

  const updateLocalPath = useCallback((newDef: PathDefinition, pushHistory = true, forceHistory = false, _actionType: string | null = null) => {
    if (!currentPathName) return;

    if (pushHistory) {
      pushToHistory(forceHistory);
    }

    setPaths(prev => prev.map(p => p.name === currentPathName ? { ...p, content: newDef } : p));
    setDirtyPaths(prev => new Set(prev).add(currentPathName));
  }, [currentPathName, pushToHistory]);

  const undo = useCallback(() => {
    if (history.past.length === 0) return;
    const previous = history.past[history.past.length - 1];
    const newPast = history.past.slice(0, history.past.length - 1);

    setHistory(prev => ({
      past: newPast,
      future: [{ points: JSON.parse(JSON.stringify(currentPath.points || [])) }, ...prev.future]
    }));

    if (currentPathName) {
      setPaths(prev => prev.map(p => p.name === currentPathName ? { ...p, content: { ...p.content, points: previous.points } } : p));
      setDirtyPaths(prev => new Set(prev).add(currentPathName));
    }
  }, [history.past, currentPath.points, currentPathName]);

  const redo = useCallback(() => {
    if (history.future.length === 0) return;
    const next = history.future[0];
    const newFuture = history.future.slice(1);

    setHistory(prev => ({
      past: [...prev.past, { points: JSON.parse(JSON.stringify(currentPath.points || [])) }],
      future: newFuture
    }));

    if (currentPathName) {
      setPaths(prev => prev.map(p => p.name === currentPathName ? { ...p, content: { ...p.content, points: next.points } } : p));
      setDirtyPaths(prev => new Set(prev).add(currentPathName));
    }
  }, [history.future, currentPath.points, currentPathName]);

  const saveCurrentPath = useCallback(async () => {
    if (!currentPathName || !projectDir) return;
    const res = await (window as any).electronAPI.writePath(projectDir + '\\src\\main\\deploy\\autonomous', currentPathName, currentPath);
    if (res.error) {
      alert("Failed to save: " + res.error);
    } else {
      setDirtyPaths(prev => {
        const nd = new Set(prev);
        nd.delete(currentPathName);
        return nd;
      });
    }
  }, [currentPathName, projectDir, currentPath]);

  return {
    paths, setPaths,
    currentPathName, setCurrentPathName,
    selectedIndex, setSelectedIndex,
    dirtyPaths, setDirtyPaths,
    currentPath,
    updateLocalPath, pushToHistory,
    undo, redo, saveCurrentPath, setHistory
  };
}
