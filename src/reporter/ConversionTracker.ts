// ============================================================
// hybrid-RUSTED — ConversionTracker
// Persists and displays per-node conversion state
// across both source and rust workspaces
// Copyright 2026 Fabrizio Baroni — Apache 2.0
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { RustedConfig, ConversionState, NodeTestResult, NodeStatus } from '../types';

const STATE_FILE = 'rusted-state.json';

const STATUS_ICON: Record<NodeStatus, string> = {
    PENDING: '⚪',
    IN_PROGRESS: '🔄',
    STABLE: '🟢',
    CONFLICT: '🔴',
};

export class ConversionTracker {
    private statePath: string;

    constructor(private config: RustedConfig) {
        // State lives in the RT-Engine project dir (where you run hybrid-rusted)
        this.statePath = path.join(process.cwd(), STATE_FILE);
    }

    /** Load existing state or return empty state */
    load(): ConversionState {
        if (fs.existsSync(this.statePath)) {
            return JSON.parse(fs.readFileSync(this.statePath, 'utf-8')) as ConversionState;
        }
        return {
            sourceWorkspace: this.config.sourceWorkspace,
            rustWorkspace: this.config.rustWorkspace,
            updatedAt: new Date().toISOString(),
            nodes: {},
        };
    }

    /** Update a single node's status and last result */
    update(nodeId: string, result: NodeTestResult): void {
        const state = this.load();
        state.nodes[nodeId] = {
            status: result.status,
            lastResult: result,
        };
        state.updatedAt = new Date().toISOString();
        this.save(state);
    }

    /** Persist state to disk */
    save(state: ConversionState): void {
        fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2), 'utf-8');
    }

    /** Print a color-coded progress table to stdout */
    printTable(): void {
        const state = this.load();
        const nodes = Object.entries(state.nodes);

        console.log('\n🦀 hybrid-RUSTED — Conversion Status');
        console.log(`   Source : ${state.sourceWorkspace || '(not set)'}`);
        console.log(`   Rust   : ${state.rustWorkspace || '(not set)'}`);
        console.log(`   Updated: ${state.updatedAt || '—'}\n`);

        if (nodes.length === 0) {
            console.log('   No nodes tracked yet. Run `hybrid-rusted init` first.\n');
            return;
        }

        const col = { id: 40, status: 12, mean: 14, max: 14 };
        const header =
            'Node ID'.padEnd(col.id) +
            'Status'.padEnd(col.status) +
            'mean_diff'.padEnd(col.mean) +
            'max_diff'.padEnd(col.max);

        console.log('   ' + header);
        console.log('   ' + '─'.repeat(col.id + col.status + col.mean + col.max));

        const counts: Record<NodeStatus, number> = { PENDING: 0, IN_PROGRESS: 0, STABLE: 0, CONFLICT: 0 };

        for (const [nodeId, entry] of nodes) {
            const icon = STATUS_ICON[entry.status];
            const r = entry.lastResult;
            const mean = r ? r.meanDiff.toExponential(2) : '—';
            const max = r ? r.maxDiff.toExponential(2) : '—';
            const row =
                nodeId.substring(0, col.id - 1).padEnd(col.id) +
                `${icon} ${entry.status}`.padEnd(col.status) +
                mean.padEnd(col.mean) +
                max.padEnd(col.max);
            console.log('   ' + row);
            counts[entry.status]++;
        }

        console.log('');
        console.log(
            `   Summary: 🟢 ${counts.STABLE} STABLE  ` +
            `🔴 ${counts.CONFLICT} CONFLICT  ` +
            `🔄 ${counts.IN_PROGRESS} IN_PROGRESS  ` +
            `⚪ ${counts.PENDING} PENDING\n`
        );
    }
}
