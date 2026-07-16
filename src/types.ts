export interface PathParams {
  minSpeed?: number | null;
  maxSpeed?: number | null;
  earlyExitRange?: number | null;
  timeout?: number | null;
  interpolate?: boolean | null;
}

export interface PathPoint {
  x: number;
  y: number;
  theta?: number | null;
  event?: string | null;
  params?: PathParams | null;
}

export interface PathDefinition {
  points: PathPoint[];
  params: PathParams | null;
}

export interface SimulatedPose {
  t: number;
  x: number;
  y: number;
  theta: number;
}
