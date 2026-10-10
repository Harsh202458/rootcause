"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.responseCache = exports.ResponseCache = void 0;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const CACHE_FILE = path_1.default.join(process.cwd(), '.cache', 'responses.json');
const ENABLED = process.env.RESPONSE_CACHE_ENABLED !== 'false';
class ResponseCache {
    cache = {};
    constructor() {
        if (ENABLED) {
            this.load();
        }
    }
    load() {
        try {
            if (fs_1.default.existsSync(CACHE_FILE)) {
                const data = fs_1.default.readFileSync(CACHE_FILE, 'utf-8');
                this.cache = JSON.parse(data);
            }
        }
        catch (err) {
            console.warn('Failed to load response cache:', err);
        }
    }
    save() {
        if (!ENABLED)
            return;
        try {
            const dir = path_1.default.dirname(CACHE_FILE);
            if (!fs_1.default.existsSync(dir)) {
                fs_1.default.mkdirSync(dir, { recursive: true });
            }
            fs_1.default.writeFileSync(CACHE_FILE, JSON.stringify(this.cache, null, 2), 'utf-8');
        }
        catch (err) {
            console.warn('Failed to save response cache:', err);
        }
    }
    generateKey(provider, model, messages, tools) {
        const data = JSON.stringify({ provider, model, messages, tools });
        return crypto_1.default.createHash('sha256').update(data).digest('hex');
    }
    get(provider, model, messages, tools) {
        if (!ENABLED)
            return undefined;
        const key = this.generateKey(provider, model, messages, tools);
        return this.cache[key];
    }
    set(provider, model, messages, tools, response) {
        if (!ENABLED)
            return;
        const key = this.generateKey(provider, model, messages, tools);
        this.cache[key] = response;
        this.save();
    }
    clear() {
        this.cache = {};
        if (fs_1.default.existsSync(CACHE_FILE)) {
            fs_1.default.unlinkSync(CACHE_FILE);
        }
    }
}
exports.ResponseCache = ResponseCache;
exports.responseCache = new ResponseCache();
