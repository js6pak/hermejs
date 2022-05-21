import { BufferReader } from "..";

const MAGIC = BigInt("0x1F1903C103BC1FC6");

export class BytecodeFileHeader {
    constructor(
        public version: number,
        public sourceHash: number[],
        public fileLength: number,
        public globalCodeIndex: number,
        public functionCount: number,
        public stringKindCount: number,
        public identifierCount: number,
        public stringCount: number,
        public overflowStringCount: number,
        public stringStorageSize: number,
        public regExpCount: number,
        public regExpStorageSize: number,
        public arrayBufferSize: number,
        public objKeyBufferSize: number,
        public objValueBufferSize: number,
        public segmentID: number,
        public cjsModuleCount: number,
        public functionSourceCount: number,
        public debugInfoOffset: number,
        public flags: number,
    ) { }

    static read(reader: BufferReader): BytecodeFileHeader {
        const magic = reader.uint64();
        if (magic !== MAGIC) throw new Error("This is not a HBC file");

        const version = reader.uint32();
        const sourceHash = Array(20);
        for (let index = 0; index < sourceHash.length; index++) {
            sourceHash[index] = reader.uint8();
        }

        const value = new BytecodeFileHeader(version, sourceHash, reader.uint32(), reader.uint32(), reader.uint32(), reader.uint32(), reader.uint32(), reader.uint32(), reader.uint32(), reader.uint32(), reader.uint32(), reader.uint32(), reader.uint32(), reader.uint32(), reader.uint32(), reader.uint32(), reader.uint32(), reader.uint32(), reader.uint32(), reader.uint8());

        reader.seek(27); // padding

        return value;
    }
}

export enum ProhibitInvoke {
    ProhibitCall = 0,
    ProhibitConstruct = 1,
    ProhibitNone = 2,
}

export class FunctionHeaderFlag {
    constructor(
        public prohibitInvoke: ProhibitInvoke,
        public strictMode: boolean,
        public hasExceptionHandler: boolean,
        public hasDebugInfo: boolean,
        public overflowed: boolean,
    ) { }

    static read(reader: BufferReader): FunctionHeaderFlag {
        const [prohibitInvoke, strictMode, hasExceptionHandler, hasDebugInfo, overflowed] = reader.bits(2, 1, 1, 1, 1);
        return new FunctionHeaderFlag(prohibitInvoke, strictMode === 1, hasExceptionHandler === 1, hasDebugInfo === 1, overflowed === 1);
    }
}

export class FunctionHeader {
    constructor(
        public offset: number,
        public paramCount: number,
        public bytecodeSizeInBytes: number,
        public functionName: number,
        public infoOffset: number,
        public frameSize: number,
        public environmentSize: number,
        public highestReadCacheIndex: number,
        public highestWriteCacheIndex: number,
        public flags: FunctionHeaderFlag,
    ) { }

    get largeHeaderOffset(): number {
        if (!this.flags.overflowed) throw new Error("Can't get large header offset is overflow is false");
        return (this.infoOffset << 16) | this.offset;
    }

    static readSmall(reader: BufferReader): FunctionHeader {
        const [offset, paramCount] = reader.bits(25, 7);
        const [bytecodeSizeInBytes, functionName] = reader.bits(15, 17);
        const [infoOffset, frameSize] = reader.bits(25, 7);
        const [environmentSize, highestReadCacheIndex, highestWriteCacheIndex] = reader.bits(8, 8, 8);

        const flags = FunctionHeaderFlag.read(reader);

        return new FunctionHeader(offset, paramCount, bytecodeSizeInBytes, functionName, infoOffset, frameSize, environmentSize, highestReadCacheIndex, highestWriteCacheIndex, flags);
    }

    static readLarge(reader: BufferReader): FunctionHeader {
        return new FunctionHeader(
            reader.uint32(),
            reader.uint32(),
            reader.uint32(),
            reader.uint32(),
            reader.uint32(),
            reader.uint32(),
            reader.uint32(),
            reader.uint8(),
            reader.uint8(),
            FunctionHeaderFlag.read(reader)
        );
    }
}

const CountBits = 31;
const MaxCount = (1 << CountBits) - 1;

export enum StringKindKind {
    /// Not been used as an identifier.
    String = 0 << CountBits,

    /// Used as an identifier.
    Identifier = 1 << CountBits,
}

export class StringKindEntry {
    constructor(
        public datum: number
    ) { }

    get kind(): StringKindKind {
        return this.datum & ~MaxCount;
    }

    get count(): number {
        return this.datum & MaxCount;
    }

    static read(reader: BufferReader): StringKindEntry {
        return new StringKindEntry(reader.uint32());
    }
}

interface StringTableEntry {
    isUTF16: boolean;
    offset: number;
    length: number;
}

export class SmallStringTableEntry {
    constructor(
        public isUTF16: boolean,
        public offset: number,
        public length: number,
    ) { }

    static INVALID_OFFSET = (1 << 23);
    static INVALID_LENGTH = (1 << 8) - 1;

    get isOverflowed(): boolean {
        return this.length == SmallStringTableEntry.INVALID_LENGTH;
    }

    static read(reader: BufferReader): SmallStringTableEntry {
        const [isUTF16, offset, length] = reader.bits(1, 23, 8);

        return new SmallStringTableEntry(isUTF16 === 1, offset, length);
    }
}

export class OverflowStringTableEntry {
    constructor(
        public offset: number,
        public length: number,
    ) { }

    static read(reader: BufferReader): OverflowStringTableEntry {
        return new OverflowStringTableEntry(reader.int32(), reader.int32());
    }
}

export class RegExpTableEntry {
    constructor(
        public offset: number,
        public length: number,
    ) { }

    static read(reader: BufferReader): RegExpTableEntry {
        return new RegExpTableEntry(reader.int32(), reader.int32());
    }
}

const EMPTY = "";

/* Low-level access to bytecode file data */
export class BytecodeFileData {
    constructor(
        private _reader: BufferReader,
        public fileHeader: BytecodeFileHeader,
        public functionHeaders: FunctionHeader[],
        public stringKinds: StringKindEntry[],
        public identifierHashes: number[],
        public stringTableEntries: SmallStringTableEntry[],
        public stringTableOverflowEntries: OverflowStringTableEntry[],
        public stringStorage: Buffer,
        public arrayBuffer: Buffer,
        public objKeyBuffer: Buffer,
        public objValueBuffer: Buffer,
        public regExpTable: RegExpTableEntry[],
        public regExpStorage: Buffer,
        public cjsModuleTable: [number, number][],
        public functionSourceTable: [number, number][],
    ) { }

    getStringTableEntry(stringId: number): StringTableEntry {
        const small = this.stringTableEntries[stringId];
        if (small.isOverflowed) {
            const overflow = this.stringTableOverflowEntries[small.offset];
            return { ...overflow, isUTF16: small.isUTF16 };
        }

        return small;
    }

    getString(entry: StringTableEntry): string {
        if (entry.length === 0) return EMPTY;

        const length = entry.isUTF16 ? entry.length * 2 : entry.length;
        return this.stringStorage.toString(entry.isUTF16 ? "utf16le" : "utf8", entry.offset, entry.offset + length);
    }

    getStringById(stringId: number): string {
        return this.getString(this.getStringTableEntry(stringId));
    }

    getFunctionHeader(id: number) {
        const functionHeader = this.functionHeaders[id];
        if (functionHeader.flags.overflowed) {
            return FunctionHeader.readLarge(this._reader.clone(functionHeader.largeHeaderOffset));
        }
        return functionHeader;
    }

    static read(reader: BufferReader): BytecodeFileData {
        const fileHeader = BytecodeFileHeader.read(reader);

        reader.align();
        const functionHeaders = reader.array(fileHeader.functionCount, FunctionHeader.readSmall);

        reader.align();
        const stringKinds = reader.array(fileHeader.stringKindCount, StringKindEntry.read);

        reader.align();
        const identifierHashes = reader.array(fileHeader.identifierCount, reader => reader.uint32());

        reader.align();
        const stringTableEntries = reader.array(fileHeader.stringCount, SmallStringTableEntry.read);

        reader.align();
        const stringTableOverflowEntries = reader.array(fileHeader.overflowStringCount, OverflowStringTableEntry.read);

        reader.align();
        const stringStorage = reader.subarray(fileHeader.stringStorageSize);

        reader.align();
        const arrayBuffer = reader.subarray(fileHeader.arrayBufferSize);

        reader.align();
        const objKeyBuffer = reader.subarray(fileHeader.objKeyBufferSize);

        reader.align();
        const objValueBuffer = reader.subarray(fileHeader.objValueBufferSize);

        reader.align();
        const regExpTable = reader.array(fileHeader.regExpCount, RegExpTableEntry.read);

        reader.align();
        const regExpStorage = reader.subarray(fileHeader.regExpStorageSize);

        reader.align();
        const cjsModuleTable = reader.array<[number, number]>(fileHeader.cjsModuleCount, reader => [reader.uint32(), reader.uint32()]);

        reader.align();
        const functionSourceTable = reader.array<[number, number]>(fileHeader.functionSourceCount, reader => [reader.uint32(), reader.uint32()]);

        return new BytecodeFileData(reader, fileHeader, functionHeaders, stringKinds, identifierHashes, stringTableEntries, stringTableOverflowEntries, stringStorage, arrayBuffer, objKeyBuffer, objValueBuffer, regExpTable, regExpStorage, cjsModuleTable, functionSourceTable);
    }
}