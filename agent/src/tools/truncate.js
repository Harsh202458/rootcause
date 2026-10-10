"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.truncate = truncate;
function truncate(data) {
    const jsonString = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const maxLength = 4000;
    if (jsonString.length <= maxLength) {
        return jsonString;
    }
    const truncatedString = jsonString.substring(0, maxLength);
    return `${truncatedString}\n\n[TRUNCATED - showing first ${maxLength} chars of ${jsonString.length} total]`;
}
