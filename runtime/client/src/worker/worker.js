onmessage = (e) => {
    const args = e.data.map(String); // 念のため全て文字列化

    self.Module = {
        arguments: args, // mainに渡す引数
        locateFile: (path) => {
            if (path.endsWith(".wasm")) {
                // sample.js と sample.wasm は /client/wasm/build/ にある
                return "/client/wasm/build/" + path;
            }
            return path;
        },
        print: (text) => postMessage(text), // pritfの出力先
        printErr: (text) => postMessage("[ERR] " + text), //fprintfの出力先
        onRuntimeInitialized: () => { } //初期化後に呼ばれる関数（？）
    };

    // 通常モード（MODULARIZE=0）なら sample.js 読み込み時に自動で Module を使う
    // MODULARIZE=1 でビルドした場合は Module() を呼び出す必要あり

    // em++で生成したJSランタイム
    // 初期化処理やロード処理を行う．
    importScripts("../../wasm/build/sample.js");
};
