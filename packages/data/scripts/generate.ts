import ts from "typescript";
import fetch from "node-fetch";
import { writeFile, mkdir } from "fs/promises";
import { BytecodeList } from "./BytecodeList";

const { factory, createPrinter, createSourceFile, NewLineKind, ScriptTarget, ScriptKind, SyntaxKind } = ts;

const hermesVersion = "hermes-2022-09-14-RNv0.70.1-2a6b111ab289b55d7b78b5fdf105f466ba270fd7";
console.log("Hermes version: " + hermesVersion);

const bytecodeVersionSource = await (await fetch(`https://raw.githubusercontent.com/facebook/hermes/${hermesVersion}/include/hermes/BCGen/HBC/BytecodeVersion.h`)).text();
const bytecodeVersion = bytecodeVersionSource.match(/const static uint32_t BYTECODE_VERSION = (?<version>\d+);/)?.groups?.version;
if (bytecodeVersion === undefined) throw new Error("Failed to extract bytecode version");
console.log("Bytecode version: " + bytecodeVersion);

const bytecodeListSource = await (await fetch(`https://raw.githubusercontent.com/facebook/hermes/${hermesVersion}/include/hermes/BCGen/HBC/BytecodeList.def`)).text();
const bytecodeList = BytecodeList.parse(bytecodeListSource);

console.log(`Parsed ${bytecodeList.opCodes.size} opcodes`);

function sizeOf(cppType: string): number {
    switch (cppType) {
        case "int8_t":
        case "uint8_t":
            return 1;
        case "int16_t":
        case "uint16_t":
            return 2;
        case "int32_t":
        case "uint32_t":
            return 4;
        case "double":
            return 8;
        default:
            throw new Error("Size not known for type " + cppType);
    }
}

const printer = createPrinter({ newLine: NewLineKind.LineFeed });
async function saveFile(path: string, statements: ts.Statement[]) {
    const file = createSourceFile(path, "", ScriptTarget.Latest, false, ScriptKind.TS);
    const text = printer.printFile(factory.updateSourceFile(file, statements));
    await writeFile(path, text);
}

await mkdir("generated", { recursive: true });

declare global {
    interface Array<T> {
        pushIf(this: Array<T>, condition: boolean, value: T): Array<T>;
    }
}

Array.prototype.pushIf = function<T> (condition: boolean, value: T): Array<T> {
    if (condition) this.push(value);
    return this;
};

await saveFile("generated/OperandType.ts", [
    factory.createEnumDeclaration(
        undefined,
        [factory.createModifier(SyntaxKind.ExportKeyword)],
        factory.createIdentifier("OperandType"),
        Array.from(bytecodeList.operandTypes.entries()).map(([name]) => factory.createEnumMember(
            factory.createIdentifier(name),
            undefined
        ))
    ),
    factory.createVariableStatement(
        [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
        factory.createVariableDeclarationList(
            [factory.createVariableDeclaration(
                factory.createIdentifier("OperandTypeSize"),
                undefined,
                factory.createTypeReferenceNode(
                    factory.createIdentifier("Record"),
                    [
                        factory.createTypeReferenceNode(
                            factory.createIdentifier("OperandType"),
                            undefined
                        ),
                        factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword)
                    ]
                ),
                factory.createObjectLiteralExpression(
                    Array.from(bytecodeList.operandTypes.entries()).map(([name, type]) =>
                        factory.createPropertyAssignment(
                            factory.createComputedPropertyName(factory.createPropertyAccessExpression(
                                factory.createIdentifier("OperandType"),
                                factory.createIdentifier(name)
                            )),
                            factory.createNumericLiteral(sizeOf(type))
                        )
                    ),
                    true
                )
            )],
            ts.NodeFlags.Const
        )
    )
]);

await saveFile("generated/OpCode.ts", [
    factory.createImportDeclaration(
        undefined,
        undefined,
        factory.createImportClause(
            false,
            undefined,
            factory.createNamedImports([factory.createImportSpecifier(
                false,
                undefined,
                factory.createIdentifier("OperandType")
            )])
        ),
        factory.createStringLiteral("."),
        undefined
    ),
    factory.createEnumDeclaration(
        undefined,
        [factory.createModifier(SyntaxKind.ExportKeyword)],
        factory.createIdentifier("OpCode"),
        Array.from(bytecodeList.opCodes.keys()).map((name, index) => factory.createEnumMember(
            factory.createIdentifier(name),
            factory.createNumericLiteral(index)
        ))
    ),
    factory.createVariableStatement(
        [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
        factory.createVariableDeclarationList(
            [factory.createVariableDeclaration(
                factory.createIdentifier("OpCodeMetaData"),
                undefined,
                factory.createTypeReferenceNode(
                    factory.createIdentifier("Record"),
                    [
                        factory.createTypeReferenceNode(
                            factory.createIdentifier("OpCode"),
                            undefined
                        ),
                        factory.createTypeLiteralNode([
                            factory.createPropertySignature(
                                undefined,
                                factory.createIdentifier("operands"),
                                undefined,
                                factory.createArrayTypeNode(factory.createTypeLiteralNode([
                                    factory.createPropertySignature(
                                        undefined,
                                        factory.createIdentifier("type"),
                                        undefined,
                                        factory.createTypeReferenceNode(
                                            factory.createIdentifier("OperandType"),
                                            undefined
                                        )
                                    ),
                                    factory.createPropertySignature(
                                        undefined,
                                        factory.createIdentifier("bigintId"),
                                        factory.createToken(ts.SyntaxKind.QuestionToken),
                                        factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword)
                                    ),
                                    factory.createPropertySignature(
                                        undefined,
                                        factory.createIdentifier("functionId"),
                                        factory.createToken(ts.SyntaxKind.QuestionToken),
                                        factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword)
                                    ),
                                    factory.createPropertySignature(
                                        undefined,
                                        factory.createIdentifier("stringId"),
                                        factory.createToken(ts.SyntaxKind.QuestionToken),
                                        factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword)
                                    )
                                ])),
                            ),
                            factory.createPropertySignature(
                                undefined,
                                factory.createIdentifier("isJump"),
                                factory.createToken(ts.SyntaxKind.QuestionToken),
                                factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword)
                            )
                        ])
                    ]
                ),
                factory.createObjectLiteralExpression(
                    Array.from(bytecodeList.opCodes.entries()).map(([name, info]) =>
                        factory.createPropertyAssignment(
                            factory.createComputedPropertyName(factory.createPropertyAccessExpression(
                                factory.createIdentifier("OpCode"),
                                factory.createIdentifier(name)
                            )),
                            factory.createObjectLiteralExpression(
                                [factory.createPropertyAssignment(
                                    factory.createIdentifier("operands"),
                                    factory.createArrayLiteralExpression(
                                        info.operands.map(operand =>
                                            factory.createObjectLiteralExpression(
                                                [factory.createPropertyAssignment(
                                                    factory.createIdentifier("type"),
                                                    factory.createPropertyAccessExpression(
                                                        factory.createIdentifier("OperandType"),
                                                        factory.createIdentifier(operand.type)
                                                    )
                                                )].pushIf(operand.bigintId, factory.createPropertyAssignment(
                                                    factory.createIdentifier("bigintId"),
                                                    factory.createTrue()
                                                )).pushIf(operand.functionId, factory.createPropertyAssignment(
                                                    factory.createIdentifier("functionId"),
                                                    factory.createTrue()
                                                )).pushIf(operand.stringId, factory.createPropertyAssignment(
                                                    factory.createIdentifier("stringId"),
                                                    factory.createTrue()
                                                )),
                                                false
                                            )
                                        ),
                                        false
                                    )
                                )].pushIf(info.isJump, factory.createPropertyAssignment(
                                    factory.createIdentifier("isJump"),
                                    factory.createTrue()
                                )),
                                false
                            )
                        )
                    ),
                    true
                )
            )],
            ts.NodeFlags.Const
        )
    ),
    factory.createVariableStatement(
        [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
        factory.createVariableDeclarationList(
            [factory.createVariableDeclaration(
                factory.createIdentifier("OpCodeRegex"),
                undefined,
                undefined,
                factory.createRegularExpressionLiteral(`/(${Array.from(bytecodeList.opCodes.entries()).map(([name]) => name).join("|")})/`)
            )],
            ts.NodeFlags.Const
        )
    )
]);

await saveFile("generated/index.ts", [
    factory.createExportDeclaration(
        undefined,
        undefined,
        false,
        undefined,
        factory.createStringLiteral("./OperandType"),
        undefined
    ),
    factory.createExportDeclaration(
        undefined,
        undefined,
        false,
        undefined,
        factory.createStringLiteral("./OpCode"),
        undefined
    )
]);
