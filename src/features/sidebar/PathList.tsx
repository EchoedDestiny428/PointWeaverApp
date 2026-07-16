import React, { useState } from 'react';
import type { PathDefinition } from '../../types';

export interface PathListProps {
  paths: { name: string, content: PathDefinition }[];
  currentPathName: string | null;
  setCurrentPathName: (name: string | null) => void;
  setSelectedIndex: (idx: number | null) => void;
  dirtyPaths: Set<string>;
  projectDir: string | null;
  playbackState: 'stopped' | 'playing' | 'paused';
  playPause: () => void;
  stopPlayback: () => void;
  addWaypoint: () => void;
  flipX: () => void;
  flipY: () => void;
  saveCurrentPath: () => void;
  setPaths: (paths: { name: string, content: PathDefinition }[]) => void;
  setDirtyPaths: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export const PathList: React.FC<PathListProps> = ({
  paths, currentPathName, setCurrentPathName, setSelectedIndex, dirtyPaths, projectDir,
  playbackState, playPause, stopPlayback, addWaypoint, flipX, flipY, saveCurrentPath,
  setPaths, setDirtyPaths
}) => {
  const [isCreatingPath, setIsCreatingPath] = useState(false);
  const [newPathName, setNewPathName] = useState('');
  const [renamingPathName, setRenamingPathName] = useState<string | null>(null);
  const [renameInputValue, setRenameInputValue] = useState('');

  const confirmCreatePath = (rawName: string) => {
    const name = rawName.trim();
    if (!name) {
      setIsCreatingPath(false);
      return;
    }
    if (paths.some(p => p.name === name)) {
      alert("Path already exists!");
      return;
    }
    const def: PathDefinition = { points: [], params: null };
    setPaths([...paths, { name, content: def }]);
    setCurrentPathName(name);
    setIsCreatingPath(false);
    if (projectDir) {
      (window as any).electronAPI.writePath(projectDir + '\\src\\main\\deploy\\autonomous', name, def);
    }
  };

  const startRename = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingPathName(name);
    setRenameInputValue(name);
  };

  const confirmRename = async (oldName: string) => {
    const newName = renameInputValue.trim();
    if (!newName || newName === oldName) {
      setRenamingPathName(null);
      return;
    }
    if (paths.some(p => p.name === newName)) {
      alert("A path with that name already exists!");
      return;
    }
    if (projectDir) {
      const res = await (window as any).electronAPI.renamePath(projectDir + '\\src\\main\\deploy\\autonomous', oldName, newName);
      if (res.error) {
        alert("Failed to rename: " + res.error);
        return;
      }
    }

    setPaths(paths.map(p => p.name === oldName ? { ...p, name: newName } : p));
    if (currentPathName === oldName) setCurrentPathName(newName);

    setDirtyPaths(prev => {
      const nd = new Set(prev);
      if (nd.has(oldName)) {
        nd.delete(oldName);
        nd.add(newName);
      }
      return nd;
    });
    setRenamingPathName(null);
  };

  const deletePath = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete '${name}.json'? This cannot be undone.`)) return;

    if (projectDir) {
      const res = await (window as any).electronAPI.deletePath(projectDir + '\\src\\main\\deploy\\autonomous', name);
      if (res.error) {
        alert("Failed to delete: " + res.error);
        return;
      }
    }

    setPaths(paths.filter(p => p.name !== name));
    if (currentPathName === name) {
      setCurrentPathName(paths.find(p => p.name !== name)?.name || null);
      setSelectedIndex(null);
    }
    setDirtyPaths(prev => {
      const nd = new Set(prev);
      nd.delete(name);
      return nd;
    });
  };

  if (!projectDir) return null;

  return (
    <div className="path-list">
      <div className="list-header">
        <h3>Auton Paths</h3>
        <button className="icon-btn" onClick={() => { setIsCreatingPath(true); setNewPathName(''); }}>+</button>
      </div>
      {isCreatingPath && (
        <div style={{ padding: '0 1rem', marginBottom: '0.5rem' }}>
          <input
            autoFocus
            type="text"
            placeholder="Path Name"
            value={newPathName}
            onChange={e => setNewPathName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                confirmCreatePath(newPathName);
              } else if (e.key === 'Escape') {
                setIsCreatingPath(false);
              }
            }}
            onBlur={() => {
              if (newPathName.trim()) {
                confirmCreatePath(newPathName);
              } else {
                setIsCreatingPath(false);
              }
            }}
            style={{ width: '100%', padding: '0.25rem', boxSizing: 'border-box' }}
          />
        </div>
      )}
      <ul>
        {paths.map(p => {
          const isD = dirtyPaths.has(p.name);
          if (renamingPathName === p.name) {
            return (
              <li key={p.name} className="active" style={{ padding: '0.25rem 0.5rem' }}>
                <input
                  className="rename-input"
                  autoFocus
                  type="text"
                  value={renameInputValue}
                  onChange={e => {
                    e.stopPropagation();
                    setRenameInputValue(e.target.value);
                  }}
                  onKeyDown={e => {
                    e.stopPropagation();
                    if (e.key === 'Enter') confirmRename(p.name);
                    else if (e.key === 'Escape') setRenamingPathName(null);
                  }}
                />
              </li>
            );
          }

          return (
            <li key={p.name} className={p.name === currentPathName ? 'active' : ''} onClick={() => { setCurrentPathName(p.name); setSelectedIndex(null); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{p.name}.json {isD && '*'}</span>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button className="icon-btn-small" onClick={(e) => startRename(p.name, e)}>✎</button>
                <button className="icon-btn-small" onClick={(e) => deletePath(p.name, e)}>✖</button>
              </div>
            </li>
          );
        })}
      </ul>
      {currentPathName && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="primary-btn" style={{ flex: 1, background: playbackState === 'playing' ? '#f59e0b' : '#10b981' }} onClick={playPause}>
              {playbackState === 'playing' ? 'Pause Ghost' : 'Play Ghost'}
            </button>
            <button className="secondary-btn" onClick={stopPlayback} disabled={playbackState === 'stopped'}>
              Stop
            </button>
          </div>
          <button className="primary-btn" style={{ width: '100%' }} onClick={addWaypoint}>
            + Add Waypoint
          </button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="secondary-btn" style={{ flex: 1 }} onClick={flipX}>Flip X</button>
            <button className="secondary-btn" style={{ flex: 1 }} onClick={flipY}>Flip Y</button>
          </div>
          <button
            className="primary-btn"
            style={{ width: '100%', background: dirtyPaths.has(currentPathName) ? '#eab308' : '#3f3f46', color: dirtyPaths.has(currentPathName) ? '#000' : '#fff', opacity: dirtyPaths.has(currentPathName) ? 1 : 0.5 }}
            onClick={saveCurrentPath}
            disabled={!dirtyPaths.has(currentPathName)}
          >
            Save Path (Ctrl+S)
          </button>
        </div>
      )}
    </div>
  );
};
