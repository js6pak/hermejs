import { performance } from "perf_hooks";
import chalk from "chalk";

export function comment(value: string) {
    return `/* ${value} */`;
}

export function quote(value: string) {
    return `"${value}"`;
}

export function escape(value: string) {
    if (value.endsWith("\\"))
        value = value + "\\";
    return value.replaceAll("\"", "\\\"").replaceAll("\r", "\\r").replaceAll("\n", "\\n").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}

export function logTime(tag: string, start: number, end = performance.now()) {
    console.log(`${tag} in ${chalk.cyan(((end - start) / 1000).toFixed(4))}s`);
}

export function time<T>(tag: string, callback: () => T) {
    const start = performance.now();
    const value = callback();
    logTime(tag, start);
    return value;
}

export async function timeAsync<T>(tag: string, promise: Promise<T>) {
    const start = performance.now();
    const value = await promise;
    logTime(tag, start);
    return value;
}
