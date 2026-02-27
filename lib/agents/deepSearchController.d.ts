import { Context } from 'koishi';
import { ChatlunaAdapter } from '../services/chatluna';
import { Config } from '../config';
import type { DeepSearchEvaluation, DeepSearchHistory, DeepSearchPlan, DeepSearchReport, SearchResult } from '../types';
/**
 * DeepSearch 主控
 * 流程：plan -> execute(parallel) -> evaluate -> iterate -> synthesize
 */
export declare class DeepSearchController {
    private ctx;
    private config;
    private logger;
    private searchAgent;
    private chatlunaAdapter;
    constructor(ctx: Context, config: Config, chatlunaAdapter?: ChatlunaAdapter);
    search(claim: string): Promise<DeepSearchReport>;
    plan(claim: string, history?: DeepSearchHistory): Promise<DeepSearchPlan>;
    evaluate(results: SearchResult[], claim: string, history?: DeepSearchHistory): Promise<DeepSearchEvaluation>;
    synthesize(claim: string, history: DeepSearchHistory): Promise<DeepSearchReport>;
    private runRound;
    private executePlan;
    private shouldStop;
    private parseSearchPlan;
    private parseEvaluation;
    private parseFinalReport;
    private buildFallbackEvaluation;
    private buildFallbackReport;
    private collectTopFindings;
    private collectAllSources;
    private estimateConfidence;
    private clampConfidence;
    private parseJson;
    private withTimeout;
}
