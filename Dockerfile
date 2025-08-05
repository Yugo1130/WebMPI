# ベースイメージ
FROM node:20

# 作業ディレクトリを作成
WORKDIR /app

# package.json / package-lock.json のみ先にコピーして npm install（キャッシュ効かせるため）
COPY runtime/server/package*.json ./

# 依存インストール（wsなど）
RUN npm install

# サーバーコード本体をコピー
COPY runtime/server/ ./

# サーバー起動（package.jsonの "start" を使う）
CMD ["npm", "start"]
