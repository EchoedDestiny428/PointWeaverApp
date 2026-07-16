import React from 'react';
import type { PathDefinition, PathParams, PathPoint } from '../../types';
import { FieldImageSettings } from './FieldImageSettings';
import { PathList } from './PathList';
import { WaypointProperties } from './WaypointProperties';

export interface SidebarProps {
  projectDir: string | null;
  selectFolder: () => void;
  selectBgImage: () => void;
  bgImgObj: HTMLImageElement | null;
  bgWidth: number;
  bgHeight: number;
  bgOffsetX: number;
  bgOffsetY: number;
  isEditingBg: boolean;
  setIsEditingBg: (val: boolean) => void;
  updateBgConfig: (key: string, value: number) => void;
  clearBgImage: () => void;
  
  paths: { name: string, content: PathDefinition }[];
  currentPathName: string | null;
  setCurrentPathName: (name: string | null) => void;
  setSelectedIndex: (idx: number | null) => void;
  dirtyPaths: Set<string>;
  playbackState: 'stopped' | 'playing' | 'paused';
  playPause: () => void;
  stopPlayback: () => void;
  addWaypoint: () => void;
  flipX: () => void;
  flipY: () => void;
  saveCurrentPath: () => void;
  setPaths: (paths: { name: string, content: PathDefinition }[]) => void;
  setDirtyPaths: React.Dispatch<React.SetStateAction<Set<string>>>;
  
  currentPath: PathDefinition;
  selectedIndex: number | null;
  selectedPoint: PathPoint | null;
  updatePathParams: (field: keyof PathParams, value: any) => void;
  updateSelectedPoint: (field: keyof PathPoint, value: any) => void;
  updateSelectedPointParams: (field: keyof PathParams, value: any) => void;
  deleteSelectedWaypoint: () => void;
}

export const Sidebar: React.FC<SidebarProps> = (props) => {
  return (
    <div className="sidebar">
      <div className="brand">
        <h1>PointWeaver</h1>
        <p>Local Path Editor</p>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button className="primary-btn" style={{ flex: 1, padding: '0.5rem' }} onClick={props.selectFolder}>
          {props.projectDir ? 'Change Project' : 'Open FRC Project'}
        </button>
        {props.projectDir && (
          <button className="secondary-btn" style={{ flex: 1, padding: '0.5rem' }} onClick={props.selectBgImage}>
            Set Field Image
          </button>
        )}
      </div>

      {props.projectDir && props.bgImgObj && (
        <FieldImageSettings
          bgWidth={props.bgWidth}
          bgHeight={props.bgHeight}
          bgOffsetX={props.bgOffsetX}
          bgOffsetY={props.bgOffsetY}
          isEditingBg={props.isEditingBg}
          setIsEditingBg={props.setIsEditingBg}
          updateBgConfig={props.updateBgConfig}
          clearBgImage={props.clearBgImage}
        />
      )}

      <PathList
        paths={props.paths}
        currentPathName={props.currentPathName}
        setCurrentPathName={props.setCurrentPathName}
        setSelectedIndex={props.setSelectedIndex}
        dirtyPaths={props.dirtyPaths}
        projectDir={props.projectDir}
        playbackState={props.playbackState}
        playPause={props.playPause}
        stopPlayback={props.stopPlayback}
        addWaypoint={props.addWaypoint}
        flipX={props.flipX}
        flipY={props.flipY}
        saveCurrentPath={props.saveCurrentPath}
        setPaths={props.setPaths}
        setDirtyPaths={props.setDirtyPaths}
      />

      <WaypointProperties
        currentPathName={props.currentPathName}
        currentPath={props.currentPath}
        selectedIndex={props.selectedIndex}
        selectedPoint={props.selectedPoint}
        updatePathParams={props.updatePathParams}
        updateSelectedPoint={props.updateSelectedPoint}
        updateSelectedPointParams={props.updateSelectedPointParams}
        deleteSelectedWaypoint={props.deleteSelectedWaypoint}
      />
    </div>
  );
};
