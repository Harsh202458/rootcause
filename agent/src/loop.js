"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAgent = runAgent;
const registry_1 = require("./tools/registry");
const tracing_1 = require("./tracing");
const system_prompt_1 = require("./system-prompt");
const cache_1 = require("./cache");
async function runAgent(alert, config) {
    const maxSteps = config.maxSteps || 15;
    const tokenBudget = config.tokenBudget || 100000;
    const timeoutMs = config.timeoutMs || 300000;
    const useCache = config.useCache !== false;
    const startTime = Date.now();
    let totalTokens = 0;
    let steps = 0;
    let report = null;
    let hitLimit = null;
    const runId = await (0, tracing_1.insertRun)(alert, config.provider.name, config.provider.model);
    const messages = [
        { role: 'system', content: system_prompt_1.SYSTEM_PROMPT },
        { role: 'user', content: `Investigate this alert:\n${alert}` }
    ];
    const toolDefinitions = (0, registry_1.getToolDefinitions)();
    const executedToolCallIds = new Set();
    let forceSubmit = false;
    while (steps < maxSteps && totalTokens < tokenBudget) {
        if (Date.now() - startTime > timeoutMs) {
            hitLimit = 'timeout';
            break;
        }
        steps++;
        // Call LLM
        let response;
        if (useCache) {
            response = cache_1.responseCache.get(config.provider.name, config.provider.model, messages, toolDefinitions);
        }
        if (!response) {
            try {
                response = await config.provider.chat(messages, toolDefinitions);
                if (useCache) {
                    cache_1.responseCache.set(config.provider.name, config.provider.model, messages, toolDefinitions, response);
                }
            }
            catch (err) {
                await (0, tracing_1.updateRun)(runId, { status: 'failed', error: err.message, duration_ms: Date.now() - startTime });
                return { runId, report: null, steps, totalTokens, durationMs: Date.now() - startTime, hitLimit: null, error: err.message };
            }
        }
        totalTokens += response.usage.totalTokens;
        await (0, tracing_1.insertStep)(runId, steps, { messages: [...messages], response });
        const assistantMsg = {
            role: 'assistant',
            content: response.text || '',
            toolCalls: response.toolCalls.length > 0 ? response.toolCalls : undefined
        };
        messages.push(assistantMsg);
        if (!response.toolCalls || response.toolCalls.length === 0) {
            if (forceSubmit) {
                // Did not submit report even when forced
                break;
            }
            continue;
        }
        let reportSubmitted = false;
        for (const tc of response.toolCalls) {
            executedToolCallIds.add(tc.id);
            if (tc.name === 'submit_report') {
                const r = tc.arguments;
                // Validate evidence
                const invalidEvidence = (r.evidence || []).filter(e => !executedToolCallIds.has(e.toolCallId));
                if (invalidEvidence.length > 0) {
                    messages.push({
                        role: 'tool',
                        content: `Error: Invalid tool call IDs in evidence: ${invalidEvidence.map(e => e.toolCallId).join(', ')}. Evidence MUST reference toolCallIds from this investigation run.`,
                        toolCallId: tc.id
                    });
                    continue;
                }
                report = r;
                reportSubmitted = true;
                messages.push({
                    role: 'tool',
                    content: 'Report submitted successfully.',
                    toolCallId: tc.id
                });
                break;
            }
            try {
                const result = await (0, registry_1.executeTool)(tc.name, tc.arguments);
                messages.push({
                    role: 'tool',
                    content: JSON.stringify(result.data),
                    toolCallId: tc.id
                });
            }
            catch (err) {
                messages.push({
                    role: 'tool',
                    content: `Error executing tool: ${err.message}`,
                    toolCallId: tc.id
                });
            }
        }
        if (reportSubmitted) {
            break;
        }
    }
    if (!report && !hitLimit) {
        if (steps >= maxSteps)
            hitLimit = 'steps';
        else if (totalTokens >= tokenBudget)
            hitLimit = 'tokens';
    }
    if (!report && hitLimit && !forceSubmit) {
        // Force a final call
        messages.push({
            role: 'user',
            content: 'You have reached the maximum allowed investigation limits. You MUST call the submit_report tool NOW with your best findings so far.'
        });
        forceSubmit = true;
        // One final step
        steps++;
        try {
            const response = await config.provider.chat(messages, toolDefinitions);
            totalTokens += response.usage.totalTokens;
            const assistantMsg = {
                role: 'assistant',
                content: response.text || '',
                toolCalls: response.toolCalls.length > 0 ? response.toolCalls : undefined
            };
            messages.push(assistantMsg);
            await (0, tracing_1.insertStep)(runId, steps, { messages: [...messages], response, forced: true });
            const reportCall = response.toolCalls?.find(tc => tc.name === 'submit_report');
            if (reportCall) {
                report = reportCall.arguments;
            }
        }
        catch (err) {
            // Ignore final call error
        }
    }
    const durationMs = Date.now() - startTime;
    await (0, tracing_1.updateRun)(runId, {
        status: report ? 'completed' : 'failed',
        report: report,
        total_tokens: totalTokens,
        duration_ms: durationMs,
        error: !report ? 'Failed to produce report' : undefined
    });
    return {
        runId,
        report,
        steps,
        totalTokens,
        durationMs,
        hitLimit
    };
}
