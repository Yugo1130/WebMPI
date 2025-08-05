onmessage = (e) => {
    const type = e.data.type;
    if (type == "init") {
        self.Module = {
            arguments: e.data.args, // mainに渡す引数（argc, argv）
            rank: e.data.rank,
            size: e.data.size,
            locateFile: (path) => {
                if (path.endsWith(".wasm")) {
                    // sample.js と sample.wasm は /runtime/client/wasm/build/ にある
                    // REVIEW wasmをキャッシュしてしまうことがあるので，キャッシュバスターを導入．しかし本当に動いてるか不明．
                    return "/wasm/" + path + "?v=" + Date.now();
                }
                return path;
            },
            // print: (text) => postMessage(text), // printfの出力先
            // printErr: (text) => postMessage("[ERR] " + text), //fprintfの出力先
            print: (text) => postMessage({
                // printfの出力先
                type: "standard-output",
                text,
            }), 
            printErr: (text) => postMessage({
                //fprintfの出力先
                type: "standard-error-output",
                text,
            }),
            // 初期化後に呼ばれる関数
            onRuntimeInitialized: () => {}
        };

        // 通常モード（MODULARIZE=0）なら sample.js 読み込み時に自動で Module を使う
        // MODULARIZE=1 でビルドした場合は Module() を呼び出す必要あり

        // em++で生成したJSランタイム
        // 初期化処理やロード処理を行う．
        importScripts("/wasm/sample.js?v=" + Date.now());
    }
};
