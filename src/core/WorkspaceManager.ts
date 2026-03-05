// ============================================================
// hybrid-RUSTED — WorkspaceManager
// Loads, validates, and bridges source ↔ rust workspaces
// Copyright 2026 Fabrizio Baroni — Apache 2.0
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { RustedConfig, WorkspaceInfo } from '../types';

export class WorkspaceManager {
    constructor(private config: RustedConfig) { }

    /** Resolve and return both workspace infos (fails fast if paths invalid) */
    load(): { source: WorkspaceInfo; rust: WorkspaceInfo } {
        const source = this.resolveWorkspace(this.config.sourceWorkspace, 'source');
        const rust = this.resolveWorkspace(this.config.rustWorkspace, 'rust');
        return { source, rust };
    }

    /** Pre-validate that source has a valid RCP scan and (optionally) a test suite */
    validateSource(source: WorkspaceInfo): void {
        if (!fs.existsSync(source.rcpJsonPath)) {
            throw new Error(
                `Source workspace has no hybrid-rcp.json.\n` +
                `Run: hybrid-rcp analyze --root ${source.rootDir}`
            );
        }

        const rcp = JSON.parse(fs.readFileSync(source.rcpJsonPath, 'utf-8'));
        const nodeCount = Array.isArray(rcp.nodes) ? rcp.nodes.length : 0;
        if (nodeCount === 0) {
            throw new Error(`hybrid-rcp.json contains 0 nodes. Run hybrid-rcp again.`);
        }
        console.log(`   → Source RCP: ${nodeCount} nodes detected`);
    }

    /** Copy hybrid-tree.json + genesis-map.json from source workspace to rust workspace */
    copyBlueprintToRust(source: WorkspaceInfo, rust: WorkspaceInfo): void {
        const filesToCopy: Array<[string, string]> = [
            [source.treeJsonPath, rust.treeJsonPath],
            [source.genesisJsonPath, rust.genesisJsonPath],
        ];

        for (const [src, dst] of filesToCopy) {
            if (!fs.existsSync(src)) {
                console.warn(`   ⚠️  File not found, skipping: ${src}`);
                continue;
            }
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            fs.copyFileSync(src, dst);
            console.log(`   → Copied: ${path.basename(src)}`);
        }
    }

    // ── Private ────────────────────────────────────────────────────────────────

    private resolveWorkspace(dir: string, label: string): WorkspaceInfo {
        if (!dir || !fs.existsSync(dir)) {
            throw new Error(
                `${label} workspace not found: "${dir}"\n` +
                `Set sourceWorkspace / rustWorkspace in rusted.config.json`
            );
        }
        return {
            rootDir: dir,
            rcpJsonPath: path.join(dir, 'hybrid-rcp.json'),
            treeJsonPath: path.join(dir, 'hybrid-tree.json'),
            genesisJsonPath: path.join(dir, 'genesis-map.json'),
            srcDir: path.join(dir, 'src'),
        };
    }
}
