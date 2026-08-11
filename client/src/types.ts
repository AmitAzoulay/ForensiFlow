export interface NodeProperties {
  name?: string;
  [key: string]: any;
}

export interface GraphNode {
  id: string;
  label?: string;
  name?: string;
  properties?: NodeProperties;
  is_red?: boolean;
  x?: number;
  y?: number;
}

export interface GraphLink {
  id: string;
  source: GraphNode | string;
  target: GraphNode | string;
  type?: string;
  label?: string;
  details?: Record<string, any>;
  is_red?: boolean;
  curvature?: number;
  isBundle?: boolean;
  bundledLinks?: GraphLink[];
  timestamp?: string;
  time?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  notebook_text?: string | null;
  case_name?: string | null;
}

export interface Investigation {
  case_id: string;
  name: string;
}

export interface ViewState {
  searchQuery: string;
  activeFilters: string[];
  timeRange: { start: number; end: number } | null;
}

export interface EditState {
  redNodes: Set<string>;
  redLinks: Set<string>;
  deletedNodes: Set<string>;
  deletedLinks: Set<string>;
  unredNodes: Set<string>;
  unredLinks: Set<string>;
}

export interface SavedQuery {
  id: string;
  query: string;
  label?: string;
}
