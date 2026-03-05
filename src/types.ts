// ============================================================
// hybrid-RUSTED — Shared Types
// Copyright 2026 Fabrizio Baroni — Apache 2.0
// ============================================================

/** Per-type epsilon thresholds for differential testing */
export interface EpsilonGate {
    mean: number;
    max: number;
}

/** rusted.config.json shape */
export interface RustedConfig {
    runs: number;
    epsilon: {
        default: EpsilonGate;
        integer: EpsilonGate;
        float: EpsilonGate;
        [key: string]: EpsilonGate;
    };
    sourceWorkspace: string;
    rustWorkspace: string;
    timeout_ms: number;
}

/** Paths resolved for a single Hybrid workspace */
export interface WorkspaceInfo {
    rootDir: string;
    rcpJsonPath: string;   // hybrid-rcp.json
    treeJsonPath: string;   // hybrid-tree.json
    genesisJsonPath: string; // genesis-map.json
    srcDir: string;   // source code directory
}

/** Status of a single node in the conversion pipeline */
export type NodeStatus = 'PENDING' | 'IN_PROGRESS' | 'STABLE' | 'CONFLICT';

/** Statistical result for a single differential test run */
export interface NodeTestResult {
    nodeId: string;
    runs: number;
    meanDiff: number;
    stdDiff: number;
    maxDiff: number;
    status: NodeStatus;
    testedAt: string; // ISO timestamp
}

/** Raw output pair captured from one test run */
export interface OutputPair {
    runIndex: number;
    sourceOutput: string;
    rustOutput: string;
}

/** Full conversion state persisted to rusted-state.json */
export interface ConversionState {
    sourceWorkspace: string;
    rustWorkspace: string;
    updatedAt: string;
    nodes: {
        [nodeId: string]: {
            status: NodeStatus;
            lastResult: NodeTestResult | null;
        };
    };
}
