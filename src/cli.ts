// ============================================================
// hybrid-RUSTED — CLI Entry Point
// Copyright 2026 Fabrizio Baroni — Apache 2.0
// ============================================================

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { WorkspaceManager } from './core/WorkspaceManager';
import { ReverseTreeGenerator } from './core/ReverseTreeGenerator';
import { SkeletonGenerator } from './core/SkeletonGenerator';
import { HarnessGenerator } from './core/HarnessGenerator';
import { DifferentialRunner } from './tester/DifferentialRunner';
import { StatisticalAnalyzer } from './tester/StatisticalAnalyzer';
import { ConversionTracker } from './reporter/ConversionTracker';
import { MatrixReporter } from './reporter/MatrixReporter';
import { RustedConfig } from './types';

const CONFIG_FILE = 'rusted.config.json';

function loadConfig(cwd: string): RustedConfig {
    const configPath = path.join(cwd, CONFIG_FILE);
    if (!fs.existsSync(configPath)) {
        console.error(`❌ Config not found: ${configPath}`);
        console.error(`   Run from the hybrid-RUSTED project directory.`);
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as RustedConfig;
}

const program = new Command();

program
    .name('hybrid-rusted')
    .description('🦀 RT-Engine — Reverse-Transpilation Orchestrator with Statistical Differential Testing')
    .version('0.1.0');

// ── INIT ─────────────────────────────────────────────────────────────────────
program
    .command('init')
    .description('Scan source project, generate Reverse-TREE, copy TREE+GENESIS to Rust workspace')
    .requiredOption('--source <dir>', 'Path to source project directory (Python / C++)')
    .requiredOption('--rust <dir>', 'Path to target Rust project directory')
    .action(async (opts: { source: string; rust: string }) => {
        const config = loadConfig(process.cwd());
        config.sourceWorkspace = path.resolve(opts.source);
        config.rustWorkspace = path.resolve(opts.rust);

        console.log('\n🦀 hybrid-RUSTED — INIT');
        console.log(`   Source : ${config.sourceWorkspace}`);
        console.log(`   Rust   : ${config.rustWorkspace}\n`);

        // 1. Load and validate both workspaces
        const wm = new WorkspaceManager(config);
        const { source, rust } = wm.load();

        console.log('✅ [1/4] Workspaces loaded');

        // 2. Pre-validate source (check rcp.json exists + source has tests)
        wm.validateSource(source);
        console.log('✅ [2/4] Source pre-validated');

        // 3. Generate Reverse-TREE from orphan nodes
        const rtg = new ReverseTreeGenerator(config);
        rtg.generate(source);
        console.log('✅ [3/5] Reverse-TREE context prepared → review .brain/reverse-tree-prompt.md');

        // 4. Copy TREE + GENESIS to Rust workspace, generate Rust skeleton
        wm.copyBlueprintToRust(source, rust);
        const sg = new SkeletonGenerator(config);
        sg.generate(rust);
        console.log('✅ [4/5] Rust skeleton generated');

        // 5. Generate test harnesses (run_node.py + Rust binary)
        const hg = new HarnessGenerator(config);
        hg.generate(source, rust);
        console.log('✅ [5/5] Test harnesses generated (run_node.py + run_node/src/main.rs)');

        console.log('\n🎯 Next step: fill in business logic node by node, then run:');
        console.log('   hybrid-rusted test');
    });

// ── TEST ──────────────────────────────────────────────────────────────────────
program
    .command('test')
    .description('Run statistical differential tests between source and Rust binaries')
    .option('--node <id>', 'Test a single node by ID (default: all converted nodes)')
    .option('--runs <n>', 'Override number of runs from config')
    .action(async (opts: { node?: string; runs?: string }) => {
        const config = loadConfig(process.cwd());

        if (opts.runs) {
            config.runs = parseInt(opts.runs, 10);
        }

        const wm = new WorkspaceManager(config);
        const { source, rust } = wm.load();
        const tracker = new ConversionTracker(config);
        const runner = new DifferentialRunner(config);
        const analyzer = new StatisticalAnalyzer(config);
        const reporter = new MatrixReporter(config);

        const state = tracker.load();
        const nodeIds = opts.node
            ? [opts.node]
            : Object.keys(state.nodes).filter(id => state.nodes[id].status !== 'PENDING');

        if (nodeIds.length === 0) {
            console.log('⚠️  No converted nodes found. Run `hybrid-rusted init` first.');
            process.exit(0);
        }

        console.log(`\n🦀 hybrid-RUSTED — DIFFERENTIAL TEST (${config.runs} runs × ${nodeIds.length} nodes)\n`);

        for (const nodeId of nodeIds) {
            process.stdout.write(`   Testing ${nodeId} ... `);
            const pairs = await runner.run(nodeId, source, rust);
            const result = analyzer.analyze(nodeId, pairs, rust);
            tracker.update(nodeId, result);
            reporter.report(result);
            const icon = result.status === 'STABLE' ? '🟢' : '🔴';
            console.log(`${icon} ${result.status}  (mean=${result.meanDiff.toExponential(2)}, max=${result.maxDiff.toExponential(2)})`);
        }

        console.log('\n✅ Test run complete. Run `hybrid-rusted status` for full report.');
    });

// ── STATUS ────────────────────────────────────────────────────────────────────
program
    .command('status')
    .description('Print conversion progress table across both workspaces')
    .action(() => {
        const config = loadConfig(process.cwd());
        const tracker = new ConversionTracker(config);
        tracker.printTable();
    });

program.parse(process.argv);
