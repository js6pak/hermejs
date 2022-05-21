export class IndentedWriter {
    private _tabsPending = false;
    public text = "";
    public indent = 0;

    private outputTabs() {
        if (this._tabsPending) {
            this.text += "  ".repeat(this.indent);
            this._tabsPending = false;
        }
    }

    write(value: string): IndentedWriter {
        this.outputTabs();
        this.text += value;
        return this;
    }

    writeLine(value?: string): IndentedWriter {
        this.outputTabs();
        this.write(value !== undefined ? (value + "\n") : "\n");
        this._tabsPending = true;
        return this;
    }
}