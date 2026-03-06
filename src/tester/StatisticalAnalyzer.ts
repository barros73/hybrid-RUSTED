// ============================================================
// hybrid-RUSTED — StatisticalAnalyzer
// Computes mean_diff, std_diff, max_diff from output pairs
// and applies the dual-epsilon gate to determine node status.
// Reads outputType + epsilon from hybrid-tree.json node entry.
// Copyright 2026 Fabrizio Baroni — Apache 2.0
// ============================================================

import * as fs from 'fs';
import { RustedConfig, OutputPair, NodeTestResult, EpsilonGate, NodeStatus, WorkspaceInfo } from '../types';
import type { TreeNode } from '../core/HarnessGenerator';

export class StatisticalAnalyzer {
    constructor(private config: RustedConfig) { }

    /**
     * Analyzes N output pairs for a node.
     * epsilon is resolved from the node's TREE entry (outputType / epsilon field).
     * Outputs must be JSON: { "result": <value> }
     */
    analyze(
        nodeId: string,
        pairs: OutputPair[],
        rust: WorkspaceInfo
    ): NodeTestResult {
        const diffs: number[] = pairs.map(p => this.computeDiff(p));

        const meanDiff = this.mean(diffs);
        const stdDiff = this.stddev(diffs, meanDiff);
        const maxDiff = Math.max(...diffs);

        const epsilon = this.epsilonForNode(nodeId, rust.treeJsonPath);
        const status: NodeStatus =
            meanDiff <= epsilon.mean && maxDiff <= epsilon.max ? 'STABLE' : 'CONFLICT';

        // Bonus diagnostic: non-deterministic source
        const sourceStdDev = this.checkSourceStability(pairs);
        if (sourceStdDev > 0 && status === 'CONFLICT') {
            console.warn(
                `   ⚠️  Source output is non-deterministic (std=${sourceStdDev.toExponential(2)}).` +
                ` Fix source before re-testing.`
            );
        }

        return {
            nodeId,
            runs: pairs.length,
            meanDiff,
            stdDiff,
            maxDiff,
            status,
            testedAt: new Date().toISOString(),
        };
    }

    // ── Epsilon resolution from TREE ──────────────────────────────────────────

    /**
     * Priority:
     * 1. Node's explicit `epsilon` field in TREE (e.g. "float", "integer", "default")
     * 2. Node's `outputType` mapped to config epsilon bucket
     * 3. config.epsilon.default
     */
    private epsilonForNode(nodeId: string, treeJsonPath: string): EpsilonGate {
        const node = this.findTreeNode(nodeId, treeJsonPath);
        if (!node) return this.config.epsilon.default;

        // Explicit epsilon key wins
        const epsilonKey = node.epsilon ?? this.outputTypeToEpsilonKey(node.outputType);
        return this.config.epsilon[epsilonKey] ?? this.config.epsilon.default;
    }

    private outputTypeToEpsilonKey(
        outputType?: string
    ): 'float' | 'integer' | 'default' {
        if (!outputType) return 'default';
        if (outputType.startsWith('float')) return 'float';
        if (outputType.startsWith('int')) return 'integer';
        return 'default';
    }

    private findTreeNode(nodeId: string, treeJsonPath: string): TreeNode | undefined {
        if (!fs.existsSync(treeJsonPath)) return undefined;
        const tree = JSON.parse(fs.readFileSync(treeJsonPath, 'utf-8'));
        const nodes = this.flattenTree(tree.nodes ?? tree.children ?? []);
        return nodes.find((n: TreeNode) => n.id === nodeId);
    }

    private flattenTree(nodes: TreeNode[]): TreeNode[] {
        const result: TreeNode[] = [];
        for (const n of nodes) {
            result.push(n);
            if (n.children?.length) result.push(...this.flattenTree(n.children));
        }
        return result;
    }

    // ── Statistics ────────────────────────────────────────────────────────────

    private computeDiff(pair: OutputPair): number {
        try {
            const a = this.flatten(JSON.parse(pair.sourceOutput));
            const b = this.flatten(JSON.parse(pair.rustOutput));
            const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
            let total = 0;
            for (const k of keys) {
                const valA = a[k];
                const valB = b[k];
                if (valA === valB) continue;
                if (typeof valA === 'number' && typeof valB === 'number') {
                    total += Math.abs(valA - valB);
                } else {
                    return Number.MAX_SAFE_INTEGER;
                }
            }
            return total;
        } catch {
            return pair.sourceOutput === pair.rustOutput ? 0 : Number.MAX_SAFE_INTEGER;
        }
    }

    private flatten(obj: unknown, prefix = ''): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        if (typeof obj === 'number' || typeof obj === 'string' || typeof obj === 'boolean' || obj === null) {
            result[prefix || 'value'] = obj;
        } else if (Array.isArray(obj)) {
            obj.forEach((v, i) => Object.assign(result, this.flatten(v, `${prefix}[${i}]`)));
        } else if (obj && typeof obj === 'object') {
            for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
                Object.assign(result, this.flatten(v, prefix ? `${prefix}.${k}` : k));
            }
        }
        return result;
    }

    private mean(values: number[]): number {
        return values.reduce((a, b) => a + b, 0) / values.length;
    }

    private stddev(values: number[], mean: number): number {
        const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
        return Math.sqrt(variance);
    }

    private checkSourceStability(pairs: OutputPair[]): number {
        try {
            const sourceValues = pairs.map(p => {
                const flat = this.flatten(JSON.parse(p.sourceOutput));
                return Object.values(flat)
                    .filter(v => typeof v === 'number')
                    .reduce((a, b) => (a as number) + (b as number), 0) as number;
            });
            const m = this.mean(sourceValues);
            return this.stddev(sourceValues, m);
        } catch {
            return 0;
        }
    }
}
