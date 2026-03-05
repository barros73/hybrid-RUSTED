// ============================================================
// hybrid-RUSTED — InputInjector
// Generates N deterministic synthetic inputs from the node's
// inputSchema defined in hybrid-tree.json
// Copyright 2026 Fabrizio Baroni — Apache 2.0
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RustedConfig } from '../types';
import type { InputField } from '../core/HarnessGenerator';

export interface InjectedInputs {
    tmpDir: string;
    inputFiles: string[]; // paths to input_0.json .. input_N-1.json
}

export class InputInjector {
    constructor(private config: RustedConfig) { }

    /**
     * Generates N inputs for a node using its inputSchema from the TREE.
     * If no schema is provided falls back to a generic float[] vector.
     * Each run uses a deterministic seed derived from (nodeId, runIndex)
     * so both source and Rust binaries always receive identical data.
     */
    inject(nodeId: string, inputSchema?: Record<string, InputField>, n?: number): InjectedInputs {
        const runs = n ?? this.config.runs;
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `rusted-${nodeId.replace(/:/g, '_')}-`));
        const inputFiles: string[] = [];

        for (let i = 0; i < runs; i++) {
            const seed = this.seedForRun(nodeId, i);
            const data = inputSchema
                ? this.generateFromSchema(inputSchema, seed)
                : this.generateGenericInput(seed);
            const filePath = path.join(tmpDir, `input_${i}.json`);
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
            inputFiles.push(filePath);
        }

        return { tmpDir, inputFiles };
    }

    cleanup(inputs: InjectedInputs): void {
        fs.rmSync(inputs.tmpDir, { recursive: true, force: true });
    }

    // ── Schema-driven generation ───────────────────────────────────────────────

    private generateFromSchema(
        schema: Record<string, InputField>,
        seed: number
    ): Record<string, unknown> {
        const rand = this.lcg(seed);
        const result: Record<string, unknown> = { __seed__: seed };

        for (const [key, field] of Object.entries(schema)) {
            result[key] = this.generateField(field, rand);
        }
        return result;
    }

    private generateField(field: InputField, rand: () => number): unknown {
        const [lo, hi] = field.range ?? [0, 1];

        switch (field.type) {
            case 'float':
                return lo + rand() * (hi - lo);

            case 'int':
                return Math.floor(lo + rand() * (hi - lo + 1));

            case 'bool':
                return rand() > 0.5;

            case 'string':
                return field.values
                    ? field.values[Math.floor(rand() * field.values.length)]
                    : `str_${Math.floor(rand() * 1000)}`;

            case 'float[]':
                return Array.from(
                    { length: field.length ?? 10 },
                    () => lo + rand() * (hi - lo)
                );

            case 'int[]':
                return Array.from(
                    { length: field.length ?? 10 },
                    () => Math.floor(lo + rand() * (hi - lo + 1))
                );

            default:
                return rand();
        }
    }

    // ── Fallback: generic numeric vector ──────────────────────────────────────

    private generateGenericInput(seed: number): Record<string, unknown> {
        const rand = this.lcg(seed);
        return {
            __seed__: seed,
            __generic__: true,
            x: Array.from({ length: 10 }, () => rand() * 200 - 100),
        };
    }

    // ── Utilities ─────────────────────────────────────────────────────────────

    private seedForRun(nodeId: string, runIndex: number): number {
        let hash = 0;
        const str = `${nodeId}::${runIndex}`;
        for (let c = 0; c < str.length; c++) {
            hash = ((hash << 5) - hash + str.charCodeAt(c)) | 0;
        }
        return Math.abs(hash);
    }

    /** Linear Congruential Generator — seeded, deterministic */
    private lcg(seed: number): () => number {
        let s = seed;
        return () => {
            s = (1664525 * s + 1013904223) & 0xffffffff;
            return (s >>> 0) / 0x100000000;
        };
    }
}
