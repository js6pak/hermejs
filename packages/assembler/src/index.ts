import { Command } from "commander";
import { disassemble } from "./Disassembler";

const program = new Command("hasm").description("(dis)assembler for hermes bytecode").version("0.1.0");

program
    .command("disassemble <input> [output]")
    .alias("d")
    .option("--skip-labels", undefined, false)
    .action(async (input: string, output: string | undefined, { skipLabels }: { skipLabels: boolean }) => {
        if (output === undefined) output = input + ".hasm";
        await disassemble(input, output, skipLabels);
    });

await program.parseAsync();
