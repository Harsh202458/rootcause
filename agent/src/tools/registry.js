"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getToolDefinitions = getToolDefinitions;
exports.getToolByName = getToolByName;
exports.executeTool = executeTool;
const list_alerts_1 = require("./list-alerts");
const service_health_1 = require("./service-health");
const query_metrics_1 = require("./query-metrics");
const query_logs_1 = require("./query-logs");
const recent_deploys_1 = require("./recent-deploys");
const run_sql_readonly_1 = require("./run-sql-readonly");
const propose_fix_1 = require("./propose-fix");
const submit_report_1 = require("./submit-report");
const tools = [
    list_alerts_1.listAlertsTool,
    service_health_1.serviceHealthTool,
    query_metrics_1.queryMetricsTool,
    query_logs_1.queryLogsTool,
    recent_deploys_1.recentDeploysTool,
    run_sql_readonly_1.runSqlReadonlyTool,
    propose_fix_1.proposeFixTool,
    submit_report_1.submitReportTool
];
function getToolDefinitions() {
    return tools.map(t => t.definition);
}
function getToolByName(name) {
    return tools.find(t => t.definition.name === name);
}
async function executeTool(name, args) {
    const tool = getToolByName(name);
    if (!tool) {
        throw new Error(`Tool ${name} not found`);
    }
    return tool.execute(args);
}
