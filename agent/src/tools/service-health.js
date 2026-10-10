"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.serviceHealthTool = void 0;
const dockerode_1 = __importDefault(require("dockerode"));
const truncate_1 = require("./truncate");
exports.serviceHealthTool = {
    definition: {
        name: 'service_health',
        description: 'Uses dockerode to inspect containers to check service health.',
        parameters: {
            type: 'object',
            properties: {
                service: {
                    type: 'string',
                    description: 'Optional service name to filter by.'
                }
            }
        }
    },
    async execute(args) {
        const docker = new dockerode_1.default();
        try {
            const containers = await docker.listContainers({ all: true });
            const results = [];
            for (const containerInfo of containers) {
                const name = containerInfo.Names[0]?.replace(/^\//, '') || 'unknown';
                if (args.service && name !== args.service && !name.includes(args.service)) {
                    continue;
                }
                let stats;
                try {
                    const container = docker.getContainer(containerInfo.Id);
                    stats = await container.stats({ stream: false });
                }
                catch (err) {
                    // ignore
                }
                const memoryUsageMB = stats ? (stats.memory_stats.usage / 1024 / 1024) : 0;
                const memoryLimitMB = stats ? (stats.memory_stats.limit / 1024 / 1024) : 0;
                const memoryPercent = memoryLimitMB > 0 ? (memoryUsageMB / memoryLimitMB) * 100 : 0;
                results.push({
                    name,
                    status: containerInfo.State,
                    version: containerInfo.Image,
                    restartCount: 0, // Mocked or requires inspect
                    uptime: containerInfo.Status,
                    memoryUsageMB: Math.round(memoryUsageMB),
                    memoryLimitMB: Math.round(memoryLimitMB),
                    memoryPercent: Math.round(memoryPercent * 100) / 100
                });
            }
            const json = JSON.stringify(results);
            const truncated = (0, truncate_1.truncate)(json);
            return {
                data: results,
                truncated: truncated.includes('[TRUNCATED')
            };
        }
        catch (error) {
            return {
                data: { error: error.message },
                truncated: false
            };
        }
    }
};
