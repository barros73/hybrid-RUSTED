// ============================================================
// hybrid-RUSTED — MatrixReporter
// Writes differential test results back into MATRIX-compatible
// format so hybrid-MATRIX can surface STABLE/CONFLICT in its
// traceability view
// Copyright 2026 Fabrizio Baroni — Apache 2.0
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { RustedConfig, NodeTestResult } from '../types';

const REPORT_FILE = 'hybrid-rusted-report.json';

interface MatrixReport {
    generatedBy: string;
    generatedAt: string;
    nodes: Record<string, MatrixNodeEntry>;
}

interface MatrixNodeEntry {
    status: string;  // STABLE | CONFLICT | PENDING
    meanDiff: number;
    stdDiff: number;
    maxDiff: number;
    runs: number;
    testedAt: string;
    matrixStatus: string; // maps to MATRIX color: GREEN | RED | WHITE
}

export class MatrixReporter {
    private reportPath: string;

    constructor(private config: RustedConfig) {
        // Report is written to rust workspace root
        this.reportPath = path.join(
            this.config.rustWorkspace || process.cwd(),
            REPORT_FILE
        );
    }

    /**
     * Appends/updates a single node's test result in the report file.
     * hybrid-MATRIX reads hybrid-rusted-report.json on next sync.
     */
    report(result: NodeTestResult): void {
        const report = this.loadReport();

        report.nodes[result.nodeId] = {
            status: result.status,
            meanDiff: result.meanDiff,
            stdDiff: result.stdDiff,
            maxDiff: result.maxDiff,
            runs: result.runs,
            testedAt: result.testedAt,
            matrixStatus: this.toMatrixColor(result.status),
        };

        report.generatedAt = new Date().toISOString();
        this.saveReport(report);
    }

    /** Print a summary of the full report to stdout */
    printSummary(): void {
        if (!fs.existsSync(this.reportPath)) {
            console.log('   No MATRIX report generated yet.');
            return;
        }
        const report = this.loadReport();
        const entries = Object.entries(report.nodes);
        const stable = entries.filter(([, n]) => n.status === 'STABLE').length;
        const conflict = entries.filter(([, n]) => n.status === 'CONFLICT').length;
        console.log(`\n   MATRIX Report: ${stable} 🟢 STABLE  ${conflict} 🔴 CONFLICT`);
        console.log(`   Report path: ${this.reportPath}\n`);
    }

    // ── Private ────────────────────────────────────────────────────────────────

    private loadReport(): MatrixReport {
        if (fs.existsSync(this.reportPath)) {
            return JSON.parse(fs.readFileSync(this.reportPath, 'utf-8')) as MatrixReport;
        }
        return {
            generatedBy: 'hybrid-RUSTED',
            generatedAt: new Date().toISOString(),
            nodes: {},
        };
    }

    private saveReport(report: MatrixReport): void {
        fs.mkdirSync(path.dirname(this.reportPath), { recursive: true });
        fs.writeFileSync(this.reportPath, JSON.stringify(report, null, 2), 'utf-8');
    }

    private toMatrixColor(status: string): string {
        switch (status) {
            case 'STABLE': return 'GREEN';
            case 'CONFLICT': return 'RED';
            default: return 'WHITE';
        }
    }
}
