import { writeFile } from "fs/promises";
import { BytecodeFile, ProhibitInvoke } from "@hermejs/core";
import { OperandType, OpCode } from "@hermejs/data";
import { IndentedWriter } from "./IndentedWriter";
import { performance } from "perf_hooks";
import { timeAsync, time, comment, escape, quote, logTime } from "./utils";
import chalk from "chalk";

export async function disassemble(input: string, output: string, skipLabels: boolean) {
    const start = performance.now();

    console.log("Disassembling " + chalk.yellowBright(input));
    const file = await timeAsync("Read file", BytecodeFile.readFile(input));

    const writer = new IndentedWriter();

    writer.writeLine("version " + file.version);
    writer.writeLine();

    const closureOpCodes = [OpCode.CreateClosure, OpCode.CreateClosureLongIndex, OpCode.CreateAsyncClosure, OpCode.CreateAsyncClosure, OpCode.CreateAsyncClosureLongIndex, OpCode.CreateGeneratorClosure, OpCode.CreateGeneratorClosureLongIndex];
    time("Wrote functions", () => {
        file.functions.forEach((fun, i) => {
            const options = new Map<string, string>();

            if (fun.name) {
                options.set("name", fun.header.functionName + " " + comment(escape(fun.name)));
            }

            if (fun.prohibitInvoke !== ProhibitInvoke.ProhibitNone) {
                options.set("prohibitInvoke", ProhibitInvoke[fun.prohibitInvoke]);
            }

            writer.writeLine(`function ${i}${options.size === 0 ? "" : ` (${Array.from(options.entries()).map(([k, v]) => `${k} = ${v}`).join(", ")})`} {`);
            writer.indent += 2;

            if (!skipLabels) fun.detectLabels();
            for (const instruction of fun.instructions) {
                if (instruction.label !== undefined) {
                    writer.indent -= 2;
                    writer.writeLine("L" + instruction.label + ":");
                    writer.indent += 2;
                }

                writer.writeLine(`${OpCode[instruction.opCode]} ${instruction.operands.map((operand, i) => {
                    switch (operand.type) {
                        case OperandType.Reg8:
                        case OperandType.Reg32:
                            return "r" + operand.value;
                        case OperandType.UInt8:
                        case OperandType.UInt16:
                        case OperandType.UInt32:
                        case OperandType.Addr8:
                        case OperandType.Addr32:
                        case OperandType.Imm32:
                        case OperandType.Double:
                            if (operand.functionId) {
                                const name = file.functions[operand.value].name;
                                if (name) return operand.value + " " + comment(escape(name));
                            }
                            if (instruction.targetLabel !== undefined && i == 0) {
                                return "L" + instruction.targetLabel;
                            }
                            if (operand.stringId) {
                                return operand.value + " " + comment(quote(escape(file.strings[operand.value])));
                            }
                            return operand.value;
                    }
                }).join(", ")}`);
            }

            writer.indent -= 2;
            writer.writeLine("}");
            writer.writeLine();
        });
    });

    time("Wrote strings", () => {
        file.strings.forEach((string, i) => {
            writer.writeLine(`string ${i} ${quote(escape(string))}`);
        });
    });

    await timeAsync("Wrote to " + chalk.yellow(output), writeFile(output, writer.text));

    logTime("Done", start);
}