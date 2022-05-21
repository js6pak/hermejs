import { OperandType } from "@hermejs/data";

export enum SeekOrigin {
    Begin,
    Current,
    End
}

export class BufferReader {
    public position = 0;

    constructor(public readonly buffer: Buffer) { }

    int8() {
        const value = this.buffer.readInt8(this.position);
        this.position += 1;
        return value;
    }

    int16() {
        const value = this.buffer.readInt16LE(this.position);
        this.position += 2;
        return value;
    }

    int32() {
        const value = this.buffer.readInt32LE(this.position);
        this.position += 4;
        return value;
    }

    int64() {
        const value = this.buffer.readBigInt64LE(this.position);
        this.position += 8;
        return value;
    }

    uint8() {
        const value = this.buffer.readUInt8(this.position);
        this.position += 1;
        return value;
    }

    uint16() {
        const value = this.buffer.readUInt16LE(this.position);
        this.position += 2;
        return value;
    }

    uint24() {
        return (this.uint16() << 8) | this.uint8();
    }

    uint32() {
        const value = this.buffer.readUInt32LE(this.position);
        this.position += 4;
        return value;
    }

    uint64() {
        const value = this.buffer.readBigUInt64LE(this.position);
        this.position += 8;
        return value;
    }

    double() {
        const value = this.buffer.readDoubleLE(this.position);
        this.position += 8;
        return value;
    }

    bits(...fields: number[]): number[] {
        const sum = fields.reduce((pv, cv) => pv + cv, 0);

        let word: number;

        if (sum <= 8) {
            word = this.uint8();
        } else if (sum <= 16) {
            word = this.uint16();
        } else if (sum <= 24) {
            word = this.uint24();
        } else if (sum <= 32) {
            word = this.uint32();
        } else {
            throw new Error("Word can't be larger than 32 bits");
        }

        let offset = 0;
        return fields.map((field) => {
            const mask = (1 << field) - 1;
            const value = word >> offset & mask;
            offset += field;
            return value;
        });
    }

    seek(value: number, origin: SeekOrigin = SeekOrigin.Current) {
        switch (origin) {
            case SeekOrigin.Begin:
                this.position = value;
                break;
            case SeekOrigin.Current:
                this.position += value;
                break;
            case SeekOrigin.End:
                this.position = this.buffer.length + value;
                break;
        }
    }

    clone(offset: number): BufferReader {
        const reader = new BufferReader(this.buffer);
        reader.position = offset;
        return reader;
    }

    subarray(length: number): Buffer {
        return this.buffer.subarray(this.position, this.position + length);
    }

    align(alignment = 4) {
        this.position = (this.position + alignment - 1) & ~(alignment - 1);
    }

    array<T>(size: number, factory: (reader: BufferReader) => T): T[] {
        const array = Array(size);

        for (let i = 0; i < size; i++) {
            array[i] = factory(this);
        }

        return array;
    }

    operand(operandType: OperandType): number {
        switch (operandType) {
            case OperandType.Reg8:
            case OperandType.UInt8:
                return this.uint8();
            case OperandType.UInt16:
                return this.uint16();
            case OperandType.Reg32:
            case OperandType.UInt32:
                return this.uint32();
            case OperandType.Addr8:
                return this.int8();
            case OperandType.Addr32:
            case OperandType.Imm32:
                return this.int32();
            case OperandType.Double:
                return this.double();
        }
    }
}