onmessage = (e) => {
    const type = e.data.type;
    const rank = e.data.rank;
    const size = e.data.size;
    if (type == "init") {

        self.Module = {
            arguments: e.data.args, // mainに渡す引数
            locateFile: (path) => {
                if (path.endsWith(".wasm")) {
                    // sample.js と sample.wasm は /runtime/client/wasm/build/ にある
                    return "/runtime/client/wasm/build/" + path;
                }
                return path;
            },
            print: (text) => postMessage(text), // printfの出力先
            printErr: (text) => postMessage("[ERR] " + text), //fprintfの出力先
            // 初期化後に呼ばれる関数
            onRuntimeInitialized: () => {
                if (typeof Module._mpi_internal_init_world_comm === "function") {
                    Module._mpi_internal_init_world_comm(rank, size);
                } else {
                    postMessage("[ERR] mpi_internal_init_world_comm not found");
                }
            }
        };

        // 通常モード（MODULARIZE=0）なら sample.js 読み込み時に自動で Module を使う
        // MODULARIZE=1 でビルドした場合は Module() を呼び出す必要あり

        // em++で生成したJSランタイム
        // 初期化処理やロード処理を行う．
        importScripts("../../wasm/build/sample.js");
    }
};
