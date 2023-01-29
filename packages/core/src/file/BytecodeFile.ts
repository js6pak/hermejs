import { open } from "fs/promises";
import { BytecodeFileData, FunctionHeader } from ".";
import { BufferReader, Instruction } from "..";
import { OpCode, OpCodeMetaData } from "@hermejs/data";

export class BytecodeFunction {
    constructor(private _reader: BufferReader, public header: FunctionHeader, public name: string) { }

    get prohibitInvoke() {
        return this.header.flags.prohibitInvoke;
    }

    private _instructions?: Instruction[];
    private _instructionsByOffset: Record<number, Instruction> = {};

    get instructions(): Instruction[] {
        if (!this._instructions) {
            const instructions: Instruction[] = [];

            const { offset, bytecodeSizeInBytes } = this.header;

            const functionReader = new BufferReader(this._reader.buffer.subarray(offset, offset + bytecodeSizeInBytes));
            while (functionReader.position < bytecodeSizeInBytes) {
                const offset = functionReader.position;
                const opCode = functionReader.uint8() as OpCode;

                const instruction = {
                    offset,
                    opCode,
                    operands: OpCodeMetaData[opCode].operands.map(info => ({
                        type: info.type,
                        value: functionReader.operand(info.type),
                        functionId: info.functionId ?? false,
                        stringId: info.stringId ?? false
                    }))
                };
                instructions.push(instruction);
                this._instructionsByOffset[offset] = instruction;
            }

            return this._instructions = instructions;
        }

        return this._instructions;
    }

    detectLabels() {
        let labelId = 1;
        for (const instruction of this.instructions) {
            if (OpCodeMetaData[instruction.opCode].isJump) {
                const offset = instruction.operands[0].value;
                const target = this._instructionsByOffset[instruction.offset + offset];

                if (target !== undefined) {
                    instruction.targetLabel = target.label = labelId++;
                } else {
                    throw new Error("No instruction at " + offset);
                }
            }
        }
    }
}

const UNINITIALIZED = Object.create(null);
function makeLazyArray<T>(size: number, factory: (i: number) => T) {
    const array = new Array<T>(size);
    array.fill(UNINITIALIZED);

    return new Proxy(array, {
        get(target, prop) {
            if (typeof prop === "string") {
                const i = parseInt(prop);
                if (!isNaN(i) && i >= 0 && i < size) {
                    let value = target[i];
                    if (value === UNINITIALIZED)
                        value = target[i] = factory(i);
                    return value;
                }
            }
            return Reflect.get(target, prop);
        }
    });
}

/* High-level abstraction over bytecode file */
export class BytecodeFile {
    constructor(private _reader: BufferReader, public data: BytecodeFileData) {
        this.version = data.fileHeader.version;
        this.strings = makeLazyArray(data.stringTableEntries.length, data.getStringById.bind(data));
        this.functions = makeLazyArray(data.functionHeaders.length, (i) => {
            const header = data.getFunctionHeader(i);
            return new BytecodeFunction(_reader, header, this.strings[header.functionName]);
        });
    }

    version: number;
    strings: string[];
    functions: BytecodeFunction[];

    static async readFile(path: string): Promise<BytecodeFile> {
        const fd = await open(path, "r");

        try {
            return this.read(new BufferReader(await fd.readFile()));
        } finally {
            await fd.close();
        }
    }

    static read(reader: BufferReader): BytecodeFile {
        return new BytecodeFile(reader, BytecodeFileData.read(reader));
    }
}
