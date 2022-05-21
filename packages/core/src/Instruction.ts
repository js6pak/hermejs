import { OpCode, OperandType } from "@hermejs/data";

export interface Operand {
    type: OperandType;
    value: number;
    stringId: boolean;
}

export interface Instruction {
    offset: number;
    opCode: OpCode;
    operands: Operand[];
    label?: number;
    targetLabel?: number;
}