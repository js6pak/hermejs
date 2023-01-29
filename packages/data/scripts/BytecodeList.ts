export class OperandDefinition {
    public bigintId = false;
    public functionId = false;
    public stringId = false;

    constructor(public type: string) {
    }
}

export class OpCodeDefinition {
    public operands: OperandDefinition[];
    public isCallType = false;
    public isJump = false;

    constructor(public name: string, operands: string[]) {
        this.operands = operands.map(o => new OperandDefinition(o));
    }
}

export class BytecodeList {
    private constructor(public operandTypes: Map<string, string>, public opCodes: Map<string, OpCodeDefinition>) {
    }

    static parse(source: string): BytecodeList {
        const operandTypes = new Map<string, string>();
        const opCodes = new Map<string, OpCodeDefinition>();

        const comments: string[] = [];

        for (const line of source.split("\n")) {
            try {
                // license header
                if (line.startsWith("/*") || line.startsWith(" *")) continue;

                // macros
                if (line.startsWith("#") || line.startsWith("  ")) continue;

                if (line.startsWith("ASSERT_")) continue;

                if (line.startsWith("//")) {
                    comments.push(line.replace(/^\/+/, "").trim());
                    continue;
                }

                if (line === "") {
                    comments.length = 0;
                    continue;
                }

                const indexOfOpen = line.indexOf("(");
                if (indexOfOpen == -1) throw new Error("Failed to find opening bracket");

                const name = line.substring(0, indexOfOpen);
                const parameters = line.slice(indexOfOpen + 1, line.indexOf(")")).split(", ");

                const verifyParameterCount = (expected: number) => {
                    if (parameters.length != expected) throw new Error(`Wrong parameter length, expected: ${expected} actual ${parameters.length}`);
                };

                if (name.startsWith("DEFINE_OPCODE_")) {
                    const operandCount = Number(name.substring("DEFINE_OPCODE_".length));

                    verifyParameterCount(1 + operandCount);

                    const opCodeName = parameters[0];

                    opCodes.set(opCodeName, new OpCodeDefinition(opCodeName, parameters.slice(1)));
                    continue;
                }

                if (name.startsWith("DEFINE_JUMP_")) {
                    const operandCount = Number(name.substring("DEFINE_JUMP_".length));

                    verifyParameterCount(1);

                    const opCodeName = parameters[0];

                    const addJump = (name: string, type: string) => {
                        const def = new OpCodeDefinition(name, [type].concat(Array(operandCount - 1).fill("Reg8")));
                        def.isJump = true;
                        opCodes.set(name, def);
                    };

                    addJump(opCodeName, "Addr8");
                    addJump(opCodeName + "Long", "Addr32");

                    continue;
                }

                switch (name) {
                    case "DEFINE_OPERAND_TYPE": {
                        verifyParameterCount(2);
                        operandTypes.set(parameters[0], parameters[1]);
                        continue;
                    }

                    case "OPERAND_STRING_ID": {
                        verifyParameterCount(2);
                        const opCode = opCodes.get(parameters[0]);
                        if (opCode === undefined) throw new Error("Failed to find opcode with id " + parameters[0]);
                        opCode.operands[Number(parameters[1]) - 1].stringId = true;
                        continue;
                    }

                    case "DEFINE_RET_TARGET": {
                        verifyParameterCount(1);
                        const opCode = opCodes.get(parameters[0]);
                        if (opCode === undefined) throw new Error("Failed to find opcode with id " + parameters[0]);
                        opCode.isCallType = true;
                        continue;
                    }

                    case "OPERAND_FUNCTION_ID": {
                        verifyParameterCount(2);
                        const opCode = opCodes.get(parameters[0]);
                        if (opCode === undefined) throw new Error("Failed to find opcode with id " + parameters[0]);
                        opCode.operands[Number(parameters[1]) - 1].functionId = true;
                        continue;
                    }

                    case "OPERAND_BIGINT_ID": {
                        verifyParameterCount(2);
                        const opCode = opCodes.get(parameters[0]);
                        if (opCode === undefined) throw new Error("Failed to find opcode with id " + parameters[0]);
                        opCode.operands[Number(parameters[1]) - 1].bigintId = true;
                        continue;
                    }
                }

                throw new Error("Not implemented");
            } catch (error) {
                throw new Error(`Failed to parse line ${line}\n${error}`);
            }
        }

        return new BytecodeList(operandTypes, opCodes);
    }
}
